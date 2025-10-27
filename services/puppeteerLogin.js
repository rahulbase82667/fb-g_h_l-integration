// // services/puppeteerLogin.js
// import puppeteer from "puppeteer-extra";
// import StealthPlugin from "puppeteer-extra-plugin-stealth";
// import { decrypt } from "../utils/encryption.js";
// import { getFacebookAccountById, updateFacebookAccount } from "../models/FacebookAccount.js";
// import pool from "../config/database.js";
// import { Browser } from "puppeteer";
// puppeteer.use(StealthPlugin());

// /**
//  * Launch Puppeteer with proxy (if available)
//  */
// async function launchBrowser(proxyUrl) {
//   const launchOptions = {
//     headless: false, // set true in production
//     args: [
//       // `--proxy-server=${proxy.ip}:${proxy.port}`,
//       "--no-sandbox",
//       "--disable-setuid-sandbox",
//     ],
//   };

//   if (proxyUrl) {
//     launchOptions.args.push(`--proxy-server=${proxyUrl}`);
//   }

//   return await puppeteer.launch(launchOptions);
// }

// /**
//  * Try logging into Facebook using cookies or credentials
//  */
// export async function loginFacebookAccount(accountId) {
//   let browser;
//   try {

//     // 1. Get account from DB
//     const account = await getFacebookAccountById(accountId);
//     // console.log(account);
//     if (!account) throw new Error("Account not found");

//     const password = decrypt(account.password_encrypted);

//     // 2. Launch browser
//     browser = await launchBrowser(account.proxy_url);
//     // browser = await launchBrowser({ headless: true }); // for production
//     const page = await browser.newPage();

//     // 3. Load cookies if available
//     if (account.session_cookies && account.login_status=="active") {
//       try {
//         const cookies = JSON.parse(account.session_cookies);
//         await browser.setCookie(...cookies);
//         console.log(`Loaded cookies for account ${account.id}`);
//       } catch (err) {
//         console.warn("Failed to parse cookies, ignoring...");
//       }
//     }

//     // 4. Go to Facebook Marketplace
//     // await page.goto("https://www.facebook.com/marketplace/", { waitUntil: "networkidle2" });

//     // 5. check if logged in or not

//     // if not logged in

//     if (await page.$("input[name=email]")) {
//       console.log("  Session invalid, logging in manually...");
//       await page.goto("https://www.facebook.com/login", { waitUntil: "networkidle2" });
//       // Clear the email/phone field before typing
//       await page.evaluate(() => {
//         const emailField = document.querySelector("input[name=email]");
//         if (emailField) emailField.value = "";
//       }); 
//       if (account.email) {
//         await page.type('input[name=email]', account.email, { delay: 100 });
//       } else if (account.phone_number) {
//         await page.type('[name=email]', account.phone_number, { delay: 100 });
//       }

//       // Clear the password field before typing
//       await page.evaluate(() => {
//         const passField = document.querySelector("input[type=password]");
//         if (passField) passField.value = "";
//       });
//       await page.type("input[type=password]", password, { delay: 100 });
//       await Promise.all([
//         page.click("button[name='login']"),
//         page.waitForNavigation({ waitUntil: "networkidle2" }),
//       ]);

//       console.log("Logged in successfully");

//     }
//     // if logged in
//     else {
//       // 6. Perform login
//       console.log("Session valid, no login needed");
//     return { success: true, accountId: account.id ,message: "Facebook account is already Logged." };

//     }
//     // return false;
//     // 7. Save cookies
//     const cookies = await browser.cookies();
//     await updateFacebookAccount(account.id, {
//       session_cookies: JSON.stringify(cookies),
//       last_login: new Date(),
//       login_status: "active",   
//     });

//     console.log("Session cookies updated in DB");

//     return { success: true, accountId: account.id ,message: "Facebook account Logged in and cookies stored succsfully." };

//   } catch (error) {
//     console.error("Login error:", error.message);
//     if (accountId) {
//       await updateFacebookAccount(accountId, { login_status: "error" });
//     }
//     return { success: false, error: error.message };

//   }
//    finally {
//     if (browser) await browser.close();
//   }
// }



// services/puppeteerLogin.js
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { decrypt } from "../utils/encryption.js";
import {
  getFacebookAccountById,
  updateFacebookAccount,
} from "../models/FacebookAccount.js";
import { getAccountsForLoginWatcher } from "../models/FacebookAccount.js";
import { timeout } from "puppeteer";
puppeteer.use(StealthPlugin());

/**
 * Launch Puppeteer with proxy (if available)
 */
async function launchBrowser(proxyUrl) {
  const launchOptions = {
    headless: false, // set true in production
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };

  if (proxyUrl) {
    launchOptions.args.push(`--proxy-server=${proxyUrl}`);
  }

  return await puppeteer.launch(launchOptions);
}

/**
 * Fix cookie expiration timestamps and sanitize
 */
function normalizeCookies(cookies) {
  return cookies.map((c) => {
    const fixed = { ...c };

    // Convert float → int for expires
    if (fixed.expires && typeof fixed.expires === "number" && fixed.expires > 0) {
      fixed.expires = Math.floor(fixed.expires);
    }

    // Remove invalid/expired cookies
    if (fixed.expires && fixed.expires < Date.now() / 1000) {
      delete fixed.expires;
    }

    // Ensure secure Facebook cookies
    fixed.secure = true;

    // Keep only valid cookie fields
    return fixed;
  });
}

/**
 * Try logging into Facebook using cookies or credentials
 */
export async function loginFacebookAccount(accountId) {
  let browser;

  try {
    // 1️⃣ Get account
    const account = await getFacebookAccountById(accountId);
    if (!account) throw new Error("Account not found");

    const password = decrypt(account.password_encrypted);
    browser = await launchBrowser(account.proxy_url);
    const page = await browser.newPage();

    // 2️⃣ Load cookies (if available)
    // if (account.session_cookies && account.login_status === "active") {
    //   try {
    //     const cookies = normalizeCookies(JSON.parse(account.session_cookies));
    //     await page.goto("https://www.facebook.com", { waitUntil: "domcontentloaded" });
    //     await page.setCookie(...cookies);
    //     console.log(`Loaded cookies for account ${account.id}`);
    //   } catch (err) {
    //     console.warn("⚠️ Failed to load cookies:", err.message);
    //   }
    // }

    // 3️⃣ Navigate to Facebook
    await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2" });

    // 4️⃣ Check login status
    const isLoginPage = await page.$("input[name=email]");
    // if (isLoginPage) {
    console.log("Session invalid → performing manual login...");

    await page.goto("https://www.facebook.com/login", {
      waitUntil: "networkidle2",
    });

    // Type credentials
    await page.evaluate(() => {
      const e = document.querySelector("input[name=email]");
      if (e) e.value = "";
      const p = document.querySelector("input[type=password]");
      if (p) p.value = "";
    });

    if (account.email) {
      await page.type("input[name=email]", account.email, { delay: 100 });
    } else if (account.phone_number) {
      await page.type("input[name=email]", account.phone_number, { delay: 100 });
    }
    await page.type("input[type=password]", password, { delay: 100 });

    await Promise.all([
      page.click("button[name='login']"),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);


    console.log("✅ Logged in successfully");
    // } else {
    //   console.log("✅ Session still valid — no login needed");
    // }

    // 5️⃣ After login → refresh cookies
    // const cookies = normalizeCookies(await page.cookies());
    const cookies = await page.cookies(); 
    const fixedCookies = cookies.map(c => {
      const cookie = { ...c };

      // Convert milliseconds → seconds if needed
      if (cookie.expires && cookie.expires > 1e12) {
        cookie.expires = Math.floor(cookie.expires / 1000);
      }

      // Round floats to integers
      if (cookie.expires && typeof cookie.expires === "number") {
        cookie.expires = Math.floor(cookie.expires);
      }

      // Remove expired or invalid cookies
      if (cookie.expires && cookie.expires < Date.now() / 1000) {
        delete cookie.expires;
      }

      return cookie;
    });

// console.log("Cookie expiration sample:", new Date(normalized[0].expires * 1000).toISOString());

    // await updateFacebookAccount(account.id, {
    //   session_cookies: JSON.stringify(fixedCookies),
    //   last_login: new Date(),
    //   login_status: "active",
    // });

    console.log("🍪 Session cookies updated in DB");

    return {
      success: true,
      accountId: account.id,
      message: "Facebook account logged in successfully and cookies stored.",
    };
  } catch (error) {
    console.error("❌ Login error:", error.message);
    if (accountId) {
      await updateFacebookAccount(accountId, { login_status: "error" });
    }
    return { success: false, error: error.message };
  } finally {
    // if (browser) await browser.close();
  }
}

export async function watcherForLogin(){
    try{
      const ids=await getAccountsForLoginWatcher();
      if(!ids || ids.length==0) return;
      for(const id of ids){
        loginFacebookAccount(id);
      }
    } catch (error) {
      console.error("DB Error: getFacebookAccounts:", error.message);
    }  
}

