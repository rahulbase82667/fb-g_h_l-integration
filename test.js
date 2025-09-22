import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const proxies = [
  "198.23.239.134:6540:tcdcmhjv:7as9anjfx7gl",
  "136.0.207.84:6661:tcdcmhjv:7as9anjfx7gl",
  "216.10.27.159:6837:tcdcmhjv:7as9anjfx7gl",
  "142.147.128.93:6593:tcdcmhjv:7as9anjfx7gl"
]


const url = "https://btr.topscripts.in/peter_boyle@facebook_integration/test.php";

export const runPuppeteerScript = async () => {
  for (const proxy of proxies) {
    try {
      const browser = await puppeteer.launch({
        headless: false,
        args: [
          `--proxy-server=${proxy}`,
          "--no-sandbox",
          "--disable-setuid-sandbox"
        ]
      });

      const page = await browser.newPage();
      // If you need authentication, add it here (not included for safety)

      await page.setExtraHTTPHeaders({
        "User-Agent": "Mozilla/5.0 (Puppeteer Bot)"
      });

      const response = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000
      });

      console.log(`✅ Proxy ${proxy} worked, status: ${response.status()}`);
      // Do something with the page content if needed
      // const content = await page.content();
      await browser.close();
      break; // stop if one proxy works

    } catch (err) {
      console.error(`❌ Proxy ${proxy} failed:`, err.message);
      // move on to the next proxy
    }
  }
};

runPuppeteerScript();
