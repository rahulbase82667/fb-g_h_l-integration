import { getFacebookAccountById } from "../models/FacebookAccount.js";
import chatUrls, { getChatUrls, addChatUrls, updateChatUrls } from "../models/chatUrls.js"
import { createConversation } from "../models/conversations.js";
import { createMessage, getLastMessage } from "../models/Message.js";
import {getConversationByUrl} from "../models/conversations.js"
import { updateFacebookAccount } from "../models/FacebookAccount.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Keyboard, timeout } from "puppeteer";
import { convertToTimestamp } from "../utils/helpers.js";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();
puppeteer.use(StealthPlugin());



/**
 * Scrape Marketplace conversations + messages
 * 
 */



export async function scrapeChatList(accountId, options = {}) {
  const { maxConversations = 10, delayBetweenChats = 2000 } = options;
  let browser;

  try {
    // 1. Load account + cookies
    const account = await getFacebookAccountById(accountId);
    if (!account || !account.session_cookies) {
      throw new Error("Account or cookies not found");
    }

    const cookies = JSON.parse(account.session_cookies);

    // 2. Launch Puppeteer with better stealth settings
    browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor",
        '--disable-notifications'
      ],
      defaultViewport: { width: 1366, height: 768 }
    });

    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set cookies
    await browser.setCookie(...cookies);

    // 3. Navigate to Facebook Messages
    console.log("Navigating to Facebook Messages...");
    await page.goto("https://www.facebook.com/messages", {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    console.log("Page loaded, waiting for chat interface...");
    // Wait for Messenger button and click

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
      for (const btn of buttons) {
        if ([...btn.querySelectorAll('span')].some(span => span.textContent.includes('Marketplace'))) {
          btn.click();
          setTimeout(() => {
            console.log('clicked')
          }, 2000);
          return true;
        }
      }
      return false;
    });
    page.setDefaultTimeout(3000);
    await page.waitForSelector("div[role='main']", { timeout: 20000 });
    // Enhanced chat link extraction with error handling
    const chatList = await page.evaluate(() => {
      try {
        // Look for chat links in multiple possible locations
        const chatLinks = new Set();

        // Method 1: Direct message links
        document.querySelectorAll('a[href*="/messages/t/"]').forEach(link => {
          chatLinks.add(link.href);
        });

        // Method 2: Check for any links in chat containers
        document.querySelectorAll('[aria-label="Chats"] a, [data-testid="chat-list"] a').forEach(link => {
          if (link.href && link.href.includes('/messages/t/')) {
            chatLinks.add(link.href);
          }
        });

        return Array.from(chatLinks);
      } catch (error) {
        console.error('Error extracting chat links:', error);
        return [];
      }
    });
    const marketPlaceChatUrl = []
    const conversationsToProcess = Math.min(chatList.length, maxConversations);

    for (let i = 0; i < conversationsToProcess; i++) {

      try {
        const chatUrl = chatList[i];
        console.log(`Processing conversation ${i + 1}/${conversationsToProcess}`);

        // Navigate to individual chat
        await page.goto(chatUrl, {
          waitUntil: "networkidle2",
          timeout: 30000
        });

        // Wait for chat to load
        await page.waitForFunction(() => {
          return document.querySelector('div[role="main"]') &&
            document.querySelectorAll('div[role="row"]').length > 0;
        }, { timeout: 15000 });


        let chatPartner = await page.evaluate(() => {
          const target = Array.from(document.querySelectorAll('[aria-label]')).find(el =>
            el.getAttribute('aria-label').toLowerCase().includes('conversation')
          );
          return target ? target.querySelector('h2')?.textContent || null : null;
        });


        console.log(`Scraping conversation with: ${chatPartner}`);
        if (!chatPartner.includes('·')) {
          console.log('Not a valid conversation');
          continue
        }
        marketPlaceChatUrl.push({
          chatUrl,
          chatPartner
        })
      } catch (error) {
        console.error(`Error processing conversation ${i + 1}:`, error.message);
        continue;
      }
    }
    if (chatList.length === 0) {
      throw new Error("No chat conversations found. The page structure might have changed.");
    }
    let currentUrls = await getChatUrls(accountId);

    if (currentUrls && currentUrls.length > 0) {
      console.log('updating chat urls');
      await updateChatUrls(accountId, marketPlaceChatUrl);
    } else {
      console.log('adding chat urls');
      await addChatUrls(accountId, marketPlaceChatUrl);
    }



    console.log(`Found ${chatList.length} conversation(s)`);
    return {
      chatlist: marketPlaceChatUrl
    }
  } catch (error) {
    console.error("DB Error: scrapeChatList:", error.message);
    throw new Error(error.message || "Failed to scrape chat list");
  }
}
async function saveScrapedData(scrapedData) {
  // Use a map to store all promises for all conversations and their messages
  const allPromises = scrapedData.flatMap(convo => {
    // For each conversation, create a promise to save it and its messages
    return (async () => {
      // Step 1: Save the conversation and get its ID
      const convoId = await createConversation(
        convo.chatUrl,
        convo.chatPartner,
        convo.totalMessages,
        convo.scrapedAt
      );

      // Step 2: Create a promise for each message and return them
      const messagePromises = convo.messages.map(msg =>
        createMessage(convoId, msg.sender, msg.text, convertToTimestamp(msg.timestamp), msg.messageIndex)
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
export async function sendMessage(accountId, options = {}) {
  const { headless = false, viewport = { width: 1366, height: 768 } } = options;
  let browser;

  try {
    // 1. Load account + cookies
    const account = await getFacebookAccountById(accountId);
    if (!account || !account.session_cookies) {
      throw new Error("Account or cookies not found");
    }

    const cookies = JSON.parse(account.session_cookies);

    // 2. Launch Puppeteer with better stealth settings
    browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor"
      ],
      defaultViewport: { width: 1366, height: 768 }
    });

    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setCookie(...cookies);
    // Your custom Puppeteer code here
    // Example:
    await page.goto('https://www.facebook.com/messages/t/742182578820330/', { waitUntil: 'networkidle2' });
    //  let selector=await page.waitForSelector('div[role="textbox"]', { timeout: 3000 });

    //  console.log(selector);
    // // then inte  ract outside
    await page.click('div[role="textbox"]');


    let str = 'Hello i am test'.split('');
    for (let i = 0; i < str.length; i++) {
      await page.keyboard.press(str[i]);
    }

    await page.keyboard.press('Enter');
    // Return page and browser in case you want to do more after this function
    return { browser, page };
  } catch (error) {
    console.error("Error launching Puppeteer:", error);
    // if (browser) await browser.close();
    throw error;
  }
}

//////////////// crafting functions

async function extractMessagesFromPage(page, chatPartner, Findtext, indexNumber = 0) {
  return await page.evaluate(async (chatPartner, Findtext, indexNumber,) => {
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    } 
    function getLatestMesssage() {
      let arr = [];
      let text = document.querySelector('div[aria-label*="Messages in conversation titled"]')
        .querySelectorAll('div[role="row"]')
        .forEach((e) => { arr.push(e) });
      let response = arr[arr.length - 1].innerText.split('\n');
      return response
    }
    // if (isRecursive) {
      const latestMessage = getLatestMesssage();
      if (latestMessage[1].includes(Findtext) && Findtext !==null) {
        return {data:"stop"};
      // }
    }
    try {
      const conversationContainer = document.querySelector('div[aria-label*="Messages in conversation titled"]');
      if (conversationContainer) {
        const scrollContainers = conversationContainer.querySelectorAll('.x78zum5');
        for (const container of scrollContainers) {
          let attempts = 0;
          while (attempts < 20) { // prevent infinite loop
            const rows = Array.from(conversationContainer.querySelectorAll('div[role="row"]'));
            const hasBuyerProfile = rows.some(r => r.textContent.includes('View buyer profile') || r.textContent.includes(Findtext));

            if (hasBuyerProfile) {
              console.log("Reached 'View buyer profile'");
              break;
            }

            container.scrollBy(0, -1400); // scroll upward
            await sleep(1000); // wait for more messages to load
            attempts++;
          }
        }
      }
      // 🔹 Step 2: Extract messages
      const rows = document.querySelectorAll("div[role='row']");
      let lastSeenTimestamp = null;
      let messageCounter = indexNumber;  // Start from given indexNumber

      let extractedMessages = [];

      rows.forEach((row) => {
        try {
          if (!row.querySelector('div[dir="auto"]') && !row.textContent.trim()) return;
          // Detect sender
          let sender = "Unknown";
          const senderSpan = row.querySelector("span");
          const senderText = senderSpan?.innerText?.trim() || "";
          if (senderText.includes("You sent") || senderText.includes("You:")) {
            sender = "You";
          } else if (row.closest('[data-testid*="outgoing"]') ||
            row.querySelector('[aria-label*="You sent"]')) {
            sender = "You";
          } else {
            sender = chatPartner;
          }

          // Extract text
          const textElements = Array.from(row.querySelectorAll("div[dir='auto']"));
          const text = textElements
            .map(div => div.innerText?.trim() || "")
            .filter(t => t.length > 0 &&
              !t.includes("Rate") &&
              !t.includes("Message sent") &&
              !t.includes("Delivered") &&
              !t.includes("Seen"))
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

          if (timestamp) {
            lastSeenTimestamp = timestamp;
          } else {
            timestamp = lastSeenTimestamp;
          }
          if (!timestamp.includes(":")) {
            timestamp = "";
          }
          // convertToTimestamp(timestamp)
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
      console.log(extractedMessages)
      return extractedMessages;
    } catch (error) {
      console.error("Error in message extraction:", error);
      return [];
    }
  }, chatPartner, Findtext, indexNumber);
}

// export async function scrapeChat(accountId, chatUrls = [], Findtext = "345543443434", timeStamp = "", indexNumber = '') {
export async function scrapeChat(accountId, chatUrls = [], isRecursive = false) {

  // const { maxConversations = 10, delayBetweenChats = 2000 } = options;
  const maxConversations = 1;
  const delayBetweenChats = 2000;
  let browser;
  let Findtext=null;
  let indexNumber=0;
  try {
    // 1. Load account + cookies
    const account = await getFacebookAccountById(accountId);
    if (!account || !account.session_cookies) {
      throw new Error("Account or cookies not found");
    }
    if (!chatUrls || chatUrls.length == 0) {
      throw new Error("Chat url not found");
    }
    const cookies = JSON.parse(account.session_cookies);
    // 2. Launch Puppeteer with better stealth settings
    browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=VizDisplayCompositor"
      ],
      defaultViewport: { width: 1366, height: 768 }
    });
    const page = await browser.newPage();
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    // Set cookies
    await browser.setCookie(...cookies);
    //   Process conversations with limits and error handling
    const scrapedData = [];
    try {
      // Navigate to individual chat
      for (let chatUrl of chatUrls) {
          // if(isRecursive){
          const conversation=await getConversationByUrl(chatUrl);
          const getLastMessage=await axios.get(`${process.env.BASE_URL}/api/messages/last/${conversation.id}`).then(res => res.data.lastMessage).catch(err => console.error(err));;
          // const getLastMessage=await axios.get('https://fb-g-h-l-integration.onrender.com/api/messages/lastmessage').then(res => console.log(res.data)).catch(err => console.error(err));;
          Findtext=getLastMessage?.text || null;           
          indexNumber=getLastMessage?.message_index || 0;
        // }
        console.log(`Navigating to chat: ${chatUrl}`);
        await page.goto(chatUrl, {
          waitUntil: "networkidle2",
          timeout: 30000
        });

        // Wait for chat to load
        await page.waitForFunction(() => {
          return document.querySelector('div[role="main"]') &&
            document.querySelectorAll('div[role="row"]').length > 0;
        }, { timeout: 15000 });
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
      
        const getmessages = await extractMessagesFromPage(page, chatPartner, Findtext, indexNumber);
        if( getmessages.data=="stop"){
          continue
        }
        // console.log(`find text is:::-----${Findtext}`)
        const messages = filterMessagesAfterFindText(getmessages, Findtext);
        
        console.log(`Extracted ${messages.length} messages from conversation with ${chatPartner}`);

        // Store conversation data
        scrapedData.push({
          chatUrl,
          chatPartner,
          messages,
          totalMessages: messages.length,
          scrapedAt: new Date().toISOString()
        });

      }
    } catch (conversationError) {
      console.error(`Error processing conversation :`, conversationError.message);
      // Continue with next conversation instead of failing completely
    }
    console.log("Scraping completed successfully");
    await saveScrapedData(scrapedData);
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
    console.error("Scraping error:", error.message);

    // Update account with error status
    try {
      await updateFacebookAccount(accountId, {
        login_status: "error",
        last_error: error.message,
        last_scraped: new Date().toISOString()
      });
    } catch (updateError) {
      console.error("Failed to update account status:", updateError.message);
    }

    return {
      success: false,
      error: error.message,
      // partialData: scrapedData.length > 0 ? scrapedData : undefined
    };
  } finally {
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


export async function scrapeAllChats(accountId,isRecursive=false) {
  if (!accountId) {
    throw new Error("Account ID is required");
  }
  const chatList = await getChatUrls(accountId);
  if (!chatList || chatList.length === 0) {
    throw new Error("Chat urls not found");
  }
  let data=await scrapeChat(accountId, chatList,true);
  // console.log(data.summary.totalMessages);
  while(isRecursive &&!data.summary.totalMessages==0){
    data= await scrapeChat(accountId, chatList,true);
  }
  return data;
}

export async function scrapeSingleChat(accountId, chatUrls) {
  if (!accountId) {
    throw new Error("Account ID is required");
  }
  if (!chatUrls || chatUrls.length === 0) {
    throw new Error("Chat urls is required");
  }

  // const Findtext = await getLastMessage(conversationId);
  // return Findtext;
  return await scrapeChat(accountId, chatUrls,null , 0, true);
}



//-0--------------------------------- helpers

function filterMessagesAfterFindText(messages, findText) {
  // Find the index of the message containing findText

  if(findText==null){
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

