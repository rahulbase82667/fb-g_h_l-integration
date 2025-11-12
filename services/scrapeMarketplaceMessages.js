//services/scrapeMarketplaceMessages.js
import { getFacebookAccountById, getAccountsWithErrors, getPendingAccounts } from "../models/FacebookAccount.js";
import { getChatUrls, addChatUrls, updateChatUrls } from "../models/chatUrls.js"
import { createConversation, appendToConversations } from "../models/conversations.js";
import { createMessage, getLastMessage, updateMessageIndex } from "../models/Message.js";
import { addChats, getChats, deleteAllChats, updateChats } from "../models/watcher.js";
import { getConversationByUrl } from "../models/conversations.js"
import { updateFacebookAccount, getIds } from "../models/FacebookAccount.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
// import { Keyboard, timeout } from "puppeteer";
import { convertToTimestamp } from "../utils/helpers.js";
import dotenv from "dotenv";
import { logError } from "../utils/logger.js";
import { getInitalScrapeStatus, updateInitalScrapeStatus } from "../models/conversations.js";
import { decrypt } from "../utils/encryption.js";
import { waitForSelectorWithRetry } from "../utils/helpers.js"
import { acquireLock, releaseLock } from "../services/redisLock.js";

// import { trace } from "bullmq";
dotenv.config();
puppeteer.use(StealthPlugin());

export async function scrapeChatList(accountId) {
  let browser;

  try {
    // 1. Load account + cookies
    const account = await getFacebookAccountById(accountId);
    if (!account || !account.session_cookies) {
      throw new Error("Account or cookies not found");
    }

    const cookies = JSON.parse(account.session_cookies);
    const useProxy = account.proxy_url && account.proxy_port;

    // 2. Launch Puppeteer with better stealth settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        ...(useProxy ? [`--proxy-server=${account.proxy_url}:${account.proxy_port}`] : []),
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor",
        '--disable-notifications'
      ],
      defaultViewport: { width: 1366, height: 768 }
    });

    const page = await browser.newPage();
    if (useProxy && account.proxy_user && account.proxy_password) {
      await page.authenticate({
        username: account.proxy_user,
        password: decrypt(account.proxy_password)
      });
    }
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set cookies
    await browser.setCookie(...cookies);

    // 3. Navigate to Facebook Messages
    console.log("Navigating to Facebook Messages...");
    try {
      await page.goto("https://www.facebook.com/messages", {
        waitUntil: "networkidle2",
        timeout: 30000
      });
    } catch (err) {
      console.error("Navigation failed:", err.message);

      // Check for proxy tunnel error
      if (err.message.includes('net::ERR_TUNNEL_CONNECTION_FAILED') || err.message.includes('net::ERR_PROXY_CONNECTION_FAILED')) {
        throw new Error('Proxy Expired');
      }

      // return {
      //   success: false,
      //   chatlist: [],
      //   error: 'Failed to load Facebook messages'
      // };
    }
    console.log("Page loaded, waiting for chat interface...");

    const texts = await page.$$eval('.core', els => els.map(el => el.textContent.trim()));
    if (texts.length > 0 && texts[0].includes('something went wrong')) {
      throw new Error('Cookies Expired');
    }
    let emailInputs = await page.$$('input[name="email"]');
    if (emailInputs.length > 0) {
      throw new Error('Cookies Expired');
    }

    await waitForSelectorWithRetry(page, '[aria-label="Thread list"] [aria-label="Chats"]', { timeout: 30000 });

    async function clickMarketplaceWithRetries(page, maxRetries = 5) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let found = false;

        for (let scrollAttempt = 1; scrollAttempt <= 5; scrollAttempt++) {
          const marketplaceClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
            console.log('button found')
            for (const btn of buttons) {
              const hasMarketplace = [...btn.querySelectorAll('span')].some(span =>
                span.textContent.includes('Marketplace')
              );
              if (hasMarketplace) {
                btn.click();
                return true;
              }
            }
            return false;
          });

          if (marketplaceClicked) {
            console.log("Marketplace button clicked successfully.");
            found = true;
            break;
          }

          // Scroll inside Puppeteer, not inside evaluate
          await page.evaluate(() => {
            const scrollContainer = document.querySelector('[aria-label="Thread list"] [aria-label="Chats"]')?.lastChild?.lastChild?.lastChild;

            if (scrollContainer) scrollContainer.scrollBy(0, 500);
          });

          console.log(`Scroll attempt ${scrollAttempt}: waiting for new content...`);
          await page.setDefaultTimeout(3000); // Wait outside page.evaluate()
        }

        if (found) return true;
        console.log(`Attempt ${attempt} failed. Retrying...`);
        await page.setDefaultTimeout(2000);
      }

      console.log("Marketplace button not found after multiple attempts.");
      return false;
    }

    const marketplaceClicked = await clickMarketplaceWithRetries(page);
    if (!marketplaceClicked) {
      console.log("Marketplace button not found. Exiting...");
      return { chatlist: [] };
    }
    // await page.waitForSelector("div[role='main']", { timeout: 20000 });
    await waitForSelectorWithRetry(page, "div[role='main']", { timeout: 20000 });
    await waitForSelectorWithRetry(page, '[aria-label="Marketplace"]', { timeout: 20000 });
    async function getChatListWithRetries(page, maxRetries = 5) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const chatList = await page.evaluate(async () => {
          try {
            const chatLinks = [];
            let container = document.querySelectorAll('[aria-label="Marketplace"]');
            if (container.length > 1) {
              container = container[1];
            } else {
              container = container[0];
            }
            if (!container) {
              console.warn("No Marketplace container found");
              return [];
            }
            const scrollContainer = container?.lastChild?.lastChild?.lastChild;
            if (!scrollContainer) {
              console.warn("Scroll container not found");
              return [];
            }

            let previousHeight = 0;
            let sameHeightCounter = 0;
            while (scrollContainer && sameHeightCounter < 3) {
              scrollContainer.scrollBy(0, 500);
              await new Promise(resolve => setTimeout(resolve, 500)); // wait for content to load
              const currentHeight = container.querySelectorAll('[role="row"]').length;
              if (currentHeight === previousHeight) {
                sameHeightCounter++;
              } else {
                sameHeightCounter = 0;
                previousHeight = currentHeight;
              }
            }

            const rows = container.querySelectorAll('[role="row"]');
            rows.forEach(row => {
              const anchor = row.querySelector('a');
              const unreadStatus = row.innerText.split('\n').some(e => e.includes("Unread message"));
              const lines = row.innerText.split('\n');
              const chatPartner = lines[0].includes('Active now') ? lines[1] : lines[0];

              if (anchor) {
                chatLinks.push({
                  chatUrl: anchor.href,
                  unread: unreadStatus,
                  chatPartner,
                });
              }
            });

            return chatLinks;

          } catch (err) {
            console.error('Error extracting chat list:', err);
            return [];
          }
        });

        if (chatList.length > 0) {
          console.log(`✅ Chat list found on attempt ${attempt}`);
          return chatList;
        } else {
          console.warn(`❌ Attempt ${attempt} failed to extract chat list. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // optional delay before retry
        }
      }

      // After all retries fail
      throw new Error("No chat conversations found after multiple attempts. The page structure might have changed.");
    }

    // Usage:
    const chatList = await getChatListWithRetries(page);

    let currentUrls = await getChatUrls(accountId);
    if (currentUrls && currentUrls.length > 0) {
      console.log('updating chat urls');
      await updateChatUrls(accountId, chatList);
    } else {
      console.log('adding chat urls');
      await addChatUrls(accountId, chatList);
    }


    const newCookies = await page.cookies();
    console.log(`Found ${chatList.length} conversation(s)`);
    if (account.login_status !== "active") {
      updateFacebookAccount(accountId, {
        session_cookies: newCookies,
        login_status: "active",
        last_error: null,
        error_details: null,

      })
    }
    return {
      success: true,
      chatlist: chatList
    }
  } catch (error) {
    try {
      await updateFacebookAccount(accountId, {
        // session_cookies: cookies,
        login_status: "error",
        last_error: error.message,
        error_details: {
          type: "chatlist",
        }
      });
    } catch (updateError) {
      logError({
        filename: "scrapemarketplacemessages.js",
        function: "scrapechatlist",
        errorType: "updateError",
        message: updateError.message,
        stack: updateError.stack,
      });
      //   // console.error("Failed to update account status:", updateError.message);
    }
    // console.error("DB Error: scrapeChatList:", error.message);
    logError({
      filename: "scrapemarketplacemessages.js",
      function: "scrapechatlist",
      errorType: "scrapingError",
      message: error.message || "Failed to scrape chat list",
      stack: error.stack,
    });
    return {
      success: false,
      chatlist: [],
      error: error.message
    }
    // throw new Error(error.message || "Failed to scrape chat list");
  }
  finally {
    if (browser) { await browser.close(); }
  }
}

async function saveScrapedData(userId, scrapedData) {
  // return scrapedData;
  // Use a map to store all promises for all conversations and their messages
  const allPromises = scrapedData.flatMap(convo => {
    console.log('convo is: --------------------------',convo);
    // For each conversation, create a promise to save it and its messages
    return (async () => {
      // Step 1: Save the conversation and get its ID1
      const convoId = await createConversation(
        convo.chatUrl,
        convo.chatPartner,
        convo.accountId,
        convo.totalMessages,
        convo.scrapedAt
      )
      console.log('convoId is : ',convo.accountId)

      // Step 2: Create a promise for each message and return them
      const messagePromises = convo.messages.map(msg =>
        createMessage(convo.conversationId, msg.sender, msg.text, convertToTimestamp(msg.timestamp), msg.messageIndex,userId)
      );

      // Return an array of promises for this conversation's messages
      return messagePromises;
    })();
  });

  // Flatten the array of arrays of promises into a single array
  const flatPromises = await Promise.all(allPromises);
  const finalPromises = flatPromises.flat();

  // Step 3: Await all message insertions in a single parallel operation
  await Promise.all(finalPromises);
}

//////////////// crafting functions

export async function sendMessage(accountId, chatUrl, text) {
  let browser;
  if (!text || !chatUrl) {
    throw new Error("Message and chat URL are required");
  }

  try {
    // 1. Load account + cookies
    const account = await getFacebookAccountById(accountId);
    if (!account || !account.session_cookies) {
      throw new Error("Account or cookies not found");
    }
    const cookies = JSON.parse(account.session_cookies);
    const useProxy = account.proxy_url && account.proxy_port;

    // 2. Launch Puppeteer with better stealth settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        ...(useProxy ? [`--proxy-server=${account.proxy_url}:${account.proxy_port}`] : []),
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor",
        '--disable-notifications'
      ],
      defaultViewport: { width: 1366, height: 768 }
    });

    const page = await browser.newPage();
    if (useProxy && account.proxy_user && account.proxy_password) {
      await page.authenticate({
        username: account.proxy_user,
        password: decrypt(account.proxy_password)
      });
    }

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setCookie(...cookies);

    // 3. Navigate to the chat URL
    try {
      await page.goto(chatUrl, { waitUntil: 'networkidle2' });
    } catch (err) {
      throw new Error('Proxy Expired');
    }
    // Check if the session is expired (email input means expired cookies)
    let emailInputs = await page.$$('input[name="email"]');
    if (emailInputs.length > 0) {
      throw new Error('Cookies Expired');
    }
    // Wait for chat input box to load
    // try {
    //   await page.waitForSelector('div[role="textbox"]', { timeout: 20000 });
    // } catch (e) {
    //   if (e.message.includes('Waiting for selector `div[role="textbox"]` failed')) {
    //     throw new Error('Content failed to load, May be Proxy having slow internet connection or Try Updating fresh cookies');
    //   }
    //   else {
    //     throw new Error(e.message);
    //   }
    // }
    await waitForSelectorWithRetry(page, 'div[role="textbox"]', { timeout: 20000 });
    // Type the message in the input box
    await page.click('div[role="textbox"]');
    let str = text.split('');
    for (let i = 0; i < str.length; i++) {
      await page.keyboard.press(str[i]);
    }
    // Press 'Enter' to send the message
    await page.keyboard.press('Enter');
    // Update session cookies after the message is sent
    const newCookies = await page.cookies();
    await updateFacebookAccount(accountId, {
      session_cookies: newCookies,
    });
    await updateMessageIndex(chatUrl, text);
    // Return page and browser in case you want to do more after this function
    return { success: true, message: "Message sent successfully" };

  } catch (error) {
    try {
      // Update account status in case of error
      const newCookies = browser ? await browser.cookies() : [];
      await updateFacebookAccount(accountId, {
        session_cookies: newCookies,
        login_status: "error",
        last_error: error.message,
      });
    } catch (updateError) {
      logError({
        filename: "sendMessage.js",
        function: "sendMessage",
        errorType: "updateError",
        message: updateError.message,
        stack: updateError.stack,
      });
    }

    // Log the actual scraping error
    logError({
      filename: "sendMessage.js",
      function: "sendMessage",
      errorType: "scrapingError",
      message: error.message || "Failed to send message",
      stack: error.stack,
    });

    // Ensure the browser is closed if an error occurs
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

// async function extractMessagesFromPage(page, chatPartner, Findtext, indexNumber = 0, initial_scrape_status) {
//   return await page.evaluate(async (chatPartner, Findtext, indexNumber, initial_scrape_status) => {
//     function sleep(ms) {
//       return new Promise(resolve => setTimeout(resolve, ms));
//     }
//     function getLatestMesssage() {
//       let arr = [];
//       let text = document.querySelector('div[aria-label*="Messages in conversation titled"]')
//         .querySelectorAll('div[role="row"]')
//         .forEach((e) => { arr.push(e) });
//       let response = arr[arr.length - 1].innerText.split('\n');
//       return response
//     }
//     // if (isRecursive) {
//     const latestMessage = getLatestMesssage();
//     if (latestMessage[1].includes(Findtext) && Findtext !== null) {
//       return { success: true, data: "stop" };
//       // }
//     }
//     try {
//       const conversationContainer = document.querySelector('div[aria-label*="Messages in conversation titled"]');
//       if (conversationContainer && !initial_scrape_status) {
//         const container = conversationContainer.lastChild.lastChild;
//         console.log(container);
//         let attempts = 0;
//         while (attempts < 20) { // prevent infinite loop
//           const rows = Array.from(conversationContainer.querySelectorAll('div[role="row"]'));
//           const hasBuyerProfile = rows.some(r => r.textContent.includes(Findtext));
//           container.scrollBy(0, -1400); // scroll upward
//           await sleep(1000); // wait for more messages to load
//           attempts++;
//         }

//       }
//       // 🔹 Step 2: Extract messages
//       const rows = document.querySelectorAll("div[role='row']");
//       let lastSeenTimestamp = null;
//       let messageCounter = indexNumber;  // Start from given indexNumber

//       let extractedMessages = [];

//       rows.forEach((row) => {
//         try {
//           if (!row.querySelector('div[dir="auto"]') && !row.textContent.trim()) return;
//           // Detect sender
//           let sender = "Unknown";
//           const senderSpan = row.querySelector("span");
//           const senderText = senderSpan?.innerText?.trim() || "";
//           if (senderText.includes("You sent") || senderText.includes("You:")) {
//             sender = "You";
//           } else if (row.closest('[data-testid*="outgoing"]') ||
//             row.querySelector('[aria-label*="You sent"]')) {
//             sender = "You";
//           } else {
//             sender = chatPartner;
//           }

//           // Extract text
//           const textElements = Array.from(row.querySelectorAll("div[dir='auto']"));
//           const text = textElements
//             .map(div => div.innerText?.trim() || "")
//             .filter(t => t.length > 0 &&
//               !t.includes("Rate") &&
//               !t.includes("Message sent") &&
//               !t.includes("Delivered") &&
//               !t.includes("Seen"))
//             .join(" ")
//             .trim();

//           // Extract timestamp
//           let timestamp = null;
//           const timeSelectors = [
//             "h4 span",
//             "abbr[aria-label]",
//             "[title*='at']",
//             "time",
//             "[aria-label*='at']"
//           ];

//           for (const selector of timeSelectors) {
//             const timeEl = row.querySelector(selector);
//             if (timeEl) {
//               timestamp = timeEl.innerText ||
//                 timeEl.getAttribute("aria-label") ||
//                 timeEl.getAttribute("title");
//               if (timestamp) break;
//             }
//           }

//           if (timestamp) {
//             lastSeenTimestamp = timestamp;
//           } else {
//             timestamp = lastSeenTimestamp;
//           }
//           if (!timestamp.includes(":")) {
//             timestamp = "";
//           }
//           // convertToTimestamp(timestamp)
//           if (text && text.length > 0) {
//             messageCounter++;
//             extractedMessages.push({
//               sender,
//               text,
//               timestamp,
//               messageIndex: messageCounter
//             });
//           }
//         } catch (rowError) {
//           console.error(`Error processing message row ${index}:`, rowError);
//         }
//       });
//       // console.log(extractedMessages)
//       return extractedMessages;
//     } catch (error) {
//       logError({
//         filename: "scrapemarketplacemessages.js",
//         function: "extractmessagesfrompage",
//         errorType: "scrapingError",
//         message: error.message,
//         stack: error.stack,
//       });
//       // console.error("Error in message extraction:", error);
//       return {
//         success: false,
//         data: []
//       };
//     }
//   }, chatPartner, Findtext, indexNumber, initial_scrape_status);
// }

// export async function scrapeChat(accountId, chatUrls = [], Findtext = "345543443434", timeStamp = "", indexNumber = '') {


async function extractMessagesFromPage(page, chatPartner, Findtext, indexNumber = 0, initial_scrape_status) {
  try {
    const extractedMessages = await page.evaluate(async (chatPartner, Findtext, indexNumber, initial_scrape_status) => {
      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      function getLatestMesssage() {
        const arr = [];
        document.querySelector('div[aria-label*="Messages in conversation titled"]')
          ?.querySelectorAll('div[role="row"]')
          ?.forEach(e => arr.push(e));
        const response = arr[arr.length - 1]?.innerText?.split('\n') || [];
        return response;
      }

      try {
        const latestMessage = getLatestMesssage();
        if (latestMessage[1]?.includes(Findtext) && Findtext !== null) {
          return { success: true, data: "stop" };
        }

        const conversationContainer = document.querySelector('div[aria-label*="Messages in conversation titled"]');
        if (conversationContainer && !initial_scrape_status) {
          const container = conversationContainer.lastChild?.lastChild;
          let attempts = 0;
          while (attempts < 20) {
            const rows = Array.from(conversationContainer.querySelectorAll('div[role="row"]'));
            const hasBuyerProfile = rows.some(r => r.textContent.includes(Findtext));
            container?.scrollBy(0, -1400);
            await sleep(1000);
            attempts++;
          }
        }

        const rows = document.querySelectorAll("div[role='row']");
        let lastSeenTimestamp = null;
        let messageCounter = indexNumber;
        let extractedMessages = [];

        rows.forEach((row, index) => {
          try {
            if (!row.querySelector('div[dir="auto"]') && !row.textContent.trim()) return;

            // Detect sender
            let sender = "Unknown";
            const senderSpan = row.querySelector("span");
            const senderText = senderSpan?.innerText?.trim() || "";
            if (senderText.includes("You sent") || senderText.includes("You:")) {
              sender = "You";
            } else if (row.closest('[data-testid*="outgoing"]') || row.querySelector('[aria-label*="You sent"]')) {
              sender = "You";
            } else {
              sender = chatPartner;
            }

            // Extract text
            const textElements = Array.from(row.querySelectorAll("div[dir='auto']"));
            const text = textElements
              .map(div => div.innerText?.trim() || "")
              .filter(t => t.length > 0 && !t.includes("Rate") && !t.includes("Message sent") && !t.includes("Delivered") && !t.includes("Seen"))
              .join(" ")
              .trim();

            // Extract timestamp
            let timestamp = null;
            const timeSelectors = [
              "h4 span",
              "abbr[aria-label]",
              "[title*='at']",
              "time",
              "[aria-label*='at']"
            ];

            for (const selector of timeSelectors) {
              const timeEl = row.querySelector(selector);
              if (timeEl) {
                timestamp = timeEl.innerText ||
                  timeEl.getAttribute("aria-label") ||
                  timeEl.getAttribute("title");
                if (timestamp) break;
              }
            }

            if (timestamp) lastSeenTimestamp = timestamp;
            else timestamp = lastSeenTimestamp;

            if (timestamp && !timestamp.includes(":")) timestamp = "";

            if (text && text.length > 0) {
              messageCounter++;
              extractedMessages.push({
                sender,
                text,
                timestamp,
                messageIndex: messageCounter
              });
            }
          } catch (rowError) {
            console.error(`Error processing message row ${index}:`, rowError);
          }
        });

        return extractedMessages;
      } catch (innerError) {
        console.error("Error inside page.evaluate():", innerError);
        return { success: false, data: [] };
      }
    }, chatPartner, Findtext, indexNumber, initial_scrape_status);

    return extractedMessages;
  } catch (error) {
    // ✅ Log error here in Node context, where logError() exists
    logError({
      filename: "scrapemarketplacemessages.js",
      function: "extractMessagesFromPage",
      errorType: "scrapingError",
      message: error.message,
      stack: error.stack,
    });
    return { success: false, data: [] };
  }
}


export async function scrapeChat(accountId, chatUrls = [], isRecursive = false, progressCallback = null) {
  let browser;
  let Findtext = null;
  let indexNumber = 0;
  let traceChat = null;
  let userId;
  try {
    // 1. Load account + cookies
    const account = await getFacebookAccountById(accountId);
    userId=account.user_id;
    if (!account || !account.session_cookies) {
      throw new Error("Account or cookies not found");
    }
    if (!chatUrls || chatUrls.length == 0) {
      throw new Error("Chat url not found");
    }
    const useProxy = account.proxy_url && account.proxy_port;

    const cookies = JSON.parse(account.session_cookies);
    // 2. Launch Puppeteer with better stealth settings
    browser = await puppeteer.launch({
      headless: true

      ,
      args: [
        ...(useProxy ? [`--proxy-server=${account.proxy_url}:${account.proxy_port}`] : []),
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor"
      ],
      defaultViewport: { width: 1366, height: 768 }
    });
    const page = await browser.newPage();

    if (useProxy && account.proxy_user && account.proxy_password) {
      await page.authenticate({
        username: account.proxy_user,
        password: decrypt(account.proxy_password)
      });
    }
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    // Set cookies
    await browser.setCookie(...cookies);
    //   Process conversations with limits and error handling
    const scrapedData = [];
    try {
      // Navigate to individual chat
      for (let i = 0; i < chatUrls.length; i++) {
        const chatUrl = chatUrls[i];
        traceChat = chatUrl
        // console.log(chatUrl)

        const locked = await acquireLock(chatUrl);
        if (!locked) {
          console.log(`⚠️ Skipping ${chatUrl} — already being scraped`);
          continue; // Skip this URL
        }
        let conversation = await getConversationByUrl(chatUrl);
        console.log('this is conversation: ----', conversation)
        if (!conversation || conversation.length == 0) {
          console.log('appending to conversations');
          conversation=await appendToConversations(accountId, chatUrl);
          console.log('after appending to conversations', conversation);
        }
        const initial_scrape_status = await getInitalScrapeStatus(chatUrl);
        const GetLastMessage = await getLastMessage(conversation?.id);
        Findtext = GetLastMessage?.text || null;
        indexNumber = GetLastMessage?.message_index || 0;
        // }
        console.log(`Navigating to chat: ${chatUrl}`);
        try {
          await page.goto(chatUrl, { waitUntil: 'networkidle2' });
        } catch (err) {
          await releaseLock(chatUrl)
          throw new Error('Proxy Expired');
        }
        let emailInputs = await page.$$('input[name="email"]');
        // console.log(emailInputs);
        if (emailInputs.length > 0) {
          await releaseLock(chatUrl)
          throw new Error('Cookies Expired');
        }
        // Wait for chat to load
        await page.waitForFunction(() => {
          return document.querySelector('div[role="main"]') &&
            document.querySelectorAll('div[role="row"]').length > 0;
        }, { timeout: 30000 });
        // get chat partner
        let chatPartner = await page.evaluate(() => {
          const target = Array.from(document.querySelectorAll('[aria-label]')).find(el =>
            el.getAttribute('aria-label').toLowerCase().includes('conversation')
          );
          return target ? target.querySelector('h2')?.textContent || null : null;
        });
        console.log(`Scraping conversation with: ${chatPartner}`);
        if (!chatPartner.includes('·')) {
          console.log('Not a valid conversation');
          return {
            success: false,
            totalConversations: 0,
            processedConversations: 0,
            data: [],
            message: "No valid conversation found",
            summary: {
              totalMessages: 0,
              conversationPartners: []
            }
          };
        }

        const getmessages = await extractMessagesFromPage(page, chatPartner, Findtext, indexNumber, initial_scrape_status);
        if (getmessages.data == "stop") {
          continue
        }
        const messages = filterMessagesAfterFindText(getmessages, Findtext);
        console.log(`Extracted ${messages.length} messages from conversation with ${chatPartner}`);
        await updateChats(chatUrl);

        // Store conversation data
        console.log('beforre pusing dat:', conversation)
        scrapedData.push({
          conversationId:  typeof conversation === 'object' ? conversation.id : conversation,
          chatUrl,
          chatPartner,
          accountId,
          messages,
          totalMessages: messages.length,
          scrapedAt: new Date().toISOString()
        });
        // console.log(scrapedData)
        // return scrapedData;
        await updateInitalScrapeStatus(chatUrl);
        const newCookies = await page.cookies();
        await updateFacebookAccount(accountId, {
          session_cookies: newCookies,
        })
        await releaseLock(chatUrl);
        // 🔌 Report progress
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: chatUrls.length,
            partner: chatPartner,
          });
        }
      }
    } catch (conversationError) {
      console.log(conversationError)
      try {
        await updateFacebookAccount(accountId, {
          // session_cookies: cookies,
          login_status: "error",
          last_error: conversationError.message,
          error_details: {
            type: "singleChat",
            last_error: "error message",
            url: traceChat,
          }
        });
      } catch (updateError) {
        logError({
          filename: "scrapemarketplacemessages.js",
          function: "scrapechatlist",
          errorType: "updateError",
          message: updateError.message,
          stack: updateError.stack,
        });
        //   // console.error("Failed to update account status:", updateError.message);
      }
      return {
        success: false,
        totalConversations: chatUrls.length,
        processedConversations: 0,
        data: null,
        summary: {
          totalMessages: null,
          conversationPartners: null
        },
        message: "Cookies Expired"
      };
      console.error(`Error processing conversation :`, conversationError);
      // Continue with next conversation instead of failing compxletely
    }

    console.log("Scraping completed successfully");
    // console.log(scrapedData);
    await saveScrapedData(userId,scrapedData);
    // return  scrapedData;
    return {
      success: true,
      totalConversations: chatUrls.length,
      processedConversations: scrapedData.length,
      data: scrapedData,
      summary: {
        totalMessages: scrapedData.reduce((sum, conv) => sum + conv.totalMessages, 0),
        conversationPartners: scrapedData.map(conv => conv.chatPartner)
      },
      message: "Scraping completed successfully"
    };

  } catch (error) {
    console.log('error', error);
    logError({
      filename: "scrapemarketplacemessages.js",
      function: "scrapeChat",
      errorType: "scrapingError",
      message: error.message,
      stack: error.stack,
    });
    // console.error("Scraping error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
  finally {
    if (browser) {
      try {
        await browser.close();
        console.log("Browser closed successfully");
      } catch (closeError) {
        console.error("Error closing browser:", closeError.message);
      }
    }
  }
}

export async function scrapeAllChats(accountId, progressCallback = null) {
  if (!accountId) {
    throw new Error("Account ID is required");
  }

  console.log('Started scrapeAllChats');

  let chatList = await getChatUrls(accountId);
  // return chatList;
  if (!chatList || chatList.length === 0) {
    console.log("Chat URLs not found, attempting to scrape...");

    const scrapeResult = await scrapeChatList(accountId);
    console.log(scrapeResult)

    // ❗ Handle proxy or scraping failure
    if (!scrapeResult || scrapeResult.error) {
      console.error("Failed to scrape chat URLs:", scrapeResult?.error || "Unknown error");

      return {
        success: false,
        error: scrapeResult?.error || "Failed to scrape chat URLs",
        chatlist: []
      };
    }

    chatList = await getChatUrls(accountId);
  }

  if (!chatList || chatList.length === 0) {
    return {
      success: false,
      error: "No chat URLs available after scraping",
      chatlist: []
    };
  }

  const data = await scrapeChat(accountId, chatList, true, progressCallback);

  return {
    success: true,
    ...data
  };
}

export async function scrapeSingleChat(accountId, chatUrls, progressCallback = null) {

  if (!Array.isArray(chatUrls)) chatUrls = [chatUrls];

  if (!accountId) {
    throw new Error("Account ID is required");
  }
  if (!chatUrls || chatUrls.length === 0) {
    throw new Error("Chat urls is required");
  }
  console.log('started scrape single chat')
  return await scrapeChat(accountId, chatUrls, false, progressCallback);
}





//////////////////////////////////----------------------------Watcher Function-------------------------------

export async function watcher() {
  console.log('running watcher')
  try {
    const facebookAccount_ids = await getIds();
    if (facebookAccount_ids.length > 0) {
      for (const ID of facebookAccount_ids) {
        try {
          // console.log(ID);
          const scrapedChatList = await scrapeChatList(ID);
          // console.log(Object.keys(scrapeChatList).length)
          let filteredChatList = [];
          if (Object.keys(scrapedChatList).length > 0) {
            filteredChatList = scrapedChatList.chatlist.filter((item) => item.unread == true).map((item) => item.chatUrl);
            return await addChats(filteredChatList, ID);
          }
          // console.log(filteredChatList)
        }
        catch (e) {
          console.error("Error in watcher function:", err);
        }
      }
    }
  } catch (e) {
    console.error("Error in watcher function:", err);
  } finally {
    console.log('watcher completed')
  }
  return false
}


////////////////////////////////---------  schedular Function---------------------------

export async function schedular() {
  const deleted = await deleteAllChats();
  console.log('running schedular')
  try {
    let chats = await getChats();
    // return chats;
    const groupedData = chats.reduce((acc, { fb_account_id, chat_url }) => {
      const group = acc.find(item => item.fb_account_id === fb_account_id);
      if (group) {
        group.urls.push(chat_url);
      } else {
        acc.push({ fb_account_id, urls: [chat_url] });
      }

      return acc;
    }, []);

    if (groupedData.length == 0) {
      console.log("No chats to scrape");
      return true
    }
    let res = await scrapeChat(groupedData[0].fb_account_id, groupedData[0].urls);
    return res;
  }
  catch (e) {
    console.error("Error in schedular function:", err);
  }
  finally {
    console.log('schedular completed')
  }
}

// Watcher for Errors

export async function errorWatcher() {
  console.log('running errorWatcher')
  const accounts = await getAccountsWithErrors();
  // return accounts;

  // return accounts
  if (accounts.length > 0) {
    for (const acc of accounts) {
      try {
        console.log(acc.error_details.type)
        if (acc.initial_scrape_status == 0) {
          const scrape = await scrapeAllChats(acc.id);
          if (scrape.success) {
            return true;
          }
          throw new Error("Failed to scrape All Chats");
        }
        if (acc.error_details.type == "chatlist") {
          console.log('Trying to fix chatlist error')
          const scrape = await scrapeChatList(acc.id);
          if (scrape.success) {
            return true;
          }
          throw new Error("Failed to scrape chat URLs");

        }
        if (acc.error_details.type == "singleChat") {
          const scrape = await scrapeSingleChat(acc.id, acc.error_details.url);
          if (scrape.success) {
            return true;
          }
          throw new Error("Failed to scrape chat URLs");
        }

        try {
          await updateFacebookAccount(acc.id, {
            // session_cookies: cookies,
            login_status: "active",
            last_error: null,
            error_details: null,
          });
        } catch (updateError) {
          logError({
            filename: "scrapemarketplacemessages.js",
            function: "ErrorWatcher",
            errorType: "updateError",
            message: updateError.message,
            stack: updateError.stack,
          });
        }
      }
      catch (e) {
        if (acc.resolve_error_retry_count == 3) {
          await updateFacebookAccount(acc.id, {
            login_status: "error",
            resolve_error_retry_count: 0,
            last_error: acc.last_error == "Proxy Expired" ? "Proxy Expired" : "Cookies Expired",
            error_details: null,
          })
          return
        }
        let resolveErrorRetryCount = acc.resolve_error_retry_count + 1;
        await updateFacebookAccount(acc.id, {
          resolve_error_retry_count: resolveErrorRetryCount,
        });
        console.error("Error in watcher function:", e);
      }
      finally {
        console.log('errorWatcher completed')
      }
    }
  }
  return false
}


export async function processPendingAccounts() {
  try {
    const accounts = await getPendingAccounts();
    if (accounts.length == 0) return
    for (const ID of accounts) {
      try {
        console.log(ID);
        const scrapedAccounts = await scrapeAllChats(ID);
        if (scrapedAccounts.success) {
          return true;
        }
        return false
      }
      catch (err) {
        console.error("Error in watcher function:", err);
      }
    }
  } catch (e) {
    console.log(e)
  }
}



function filterMessagesAfterFindText(messages, findText) {
  // Find the index of the message containing findText

  if (findText == null) {
    return messages
  }
  const index = messages.findIndex(msg => msg.text.includes(findText));
  if (index === -1) {
    // Findtext not found, return all messages or empty array if you want only new ones
    return messages;  // or return [] if you want no old messages at all
  }
  // Return all messages after the one containing Findtext
  return messages.slice(index + 1);
}


function getLatestMesssage() {
  let arr = [];
  let text = document.querySelector('div[aria-label*="Messages in conversation titled"]')
    .querySelectorAll('div[role="row"]')
    .forEach((e) => { arr.push(e) });
  let response = arr[arr.length - 1].innerText.split('\n');
  return response
}

