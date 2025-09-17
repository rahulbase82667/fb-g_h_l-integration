// services/puppeteerLogin.js
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { decrypt } from "../utils/encryption.js";
import { getFacebookAccountById, updateFacebookAccount } from "../models/FacebookAccount.js";
import pool from "../config/database.js";
import { Browser } from "puppeteer";
import os from "os";
import path from "path";
import { executablePath } from "puppeteer"; // from puppeteer-core if needed

puppeteer.use(StealthPlugin());

/**
 * Launch Puppeteer with proxy (if available)
 */
// async function launchBrowser(proxyUrl) {
//   const launchOptions = {
//     headless: false, // set true in production
//     args: [
//       "--no-sandbox",
//       "--disable-setuid-sandbox",
//     ],
//   };

//   if (proxyUrl) {
//     launchOptions.args.push(`--proxy-server=${proxyUrl}`);
//   }

//   return await puppeteer.launch(launchOptions);
// }

async function launchBrowser(proxyUrl) {
  // 1. Set cross-platform Puppeteer cache path
  const isRender = process.env.RENDER === "true"; // or set this var yourself
  const puppeteerCacheDir = isRender
    ? "/tmp/.cache/puppeteer"
    : path.join(os.homedir(), ".puppeteer-cache");

  process.env.PUPPETEER_CACHE_DIR = puppeteerCacheDir;

  // 2. Setup launch options
  const launchOptions = {
    headless: true, // set to false only for debugging locally
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
    executablePath: executablePath(), // use Puppeteer's bundled Chrome
  };

  // 3. Add proxy if provided
  if (proxyUrl) {
    launchOptions.args.push(`--proxy-server=${proxyUrl}`);
  }

  // 4. Launch and return browser
  return await puppeteer.launch(launchOptions);
}
/**
 * Try logging into Facebook using cookies or credentials
 */
export async function loginFacebookAccount(accountId) {
  let browser;
  try {

    // 1. Get account from DB
    const account = await getFacebookAccountById(accountId);
    // console.log(account);
    if (!account) throw new Error("Account not found");

    const password = decrypt(account.password_encrypted);

    // 2. Launch browser
    browser = await launchBrowser(account.proxy_url);
    // browser = await launchBrowser({ headless: true }); // for production
    const page = await browser.newPage();

    // 3. Load cookies if available
    if (account.session_cookies && account.login_status == "active") {
      try {
        const cookies = JSON.parse(account.session_cookies);
        await browser.setCookie(...cookies);
        console.log(`Loaded cookies for account ${account.id}`);
      } catch (err) {
        console.warn("Failed to parse cookies, ignoring...");
      }
    }

    // 4. Go to Facebook Marketplace
    await page.goto("https://www.facebook.com/marketplace/", { waitUntil: "networkidle2" });

    // 5. check if logged in or not

    // if not logged in

    if (await page.$("input[name=email]")) {
      console.log("  Session invalid, logging in manually...");
      await page.goto("https://www.facebook.com/login", { waitUntil: "networkidle2" });
      // Clear the email/phone field before typing
      await page.evaluate(() => {
        const emailField = document.querySelector("input[name=email]");
        if (emailField) emailField.value = "";
      });
      if (account.email) {
        await page.type('input[name=email]', account.email, { delay: 100 });
      } else if (account.phone_number) {
        await page.type('[name=email]', account.phone_number, { delay: 100 });
      }

      // Clear the password field before typing
      await page.evaluate(() => {
        const passField = document.querySelector("input[type=password]");
        if (passField) passField.value = "";
      });
      await page.type("input[type=password]", password, { delay: 100 });
      await Promise.all([
        page.click("button[name='login']"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      console.log("Logged in successfully");

    }
    // if logged in
    else {
      // 6. Perform login
      console.log("  Session valid, no login needed");
      return { success: true, accountId: account.id, message: "Facebook account is already Logged." };

    }
    // return false;
    // 7. Save cookies
    const cookies = await browser.cookies();
    await updateFacebookAccount(account.id, {
      session_cookies: JSON.stringify(cookies),
      last_login: new Date(),
      login_status: "active",
    });

    console.log("  Session cookies updated in DB");

    return { success: true, accountId: account.id, message: "Facebook account Logged in and cookies stored succsfully." };

  } catch (error) {
    console.error("Login error:", error.message);
    if (accountId) {
      await updateFacebookAccount(accountId, { login_status: "error" });
    }
    return { success: false, error: error.message };

  }
  finally {
    if (browser) await browser.close();
  }
}
