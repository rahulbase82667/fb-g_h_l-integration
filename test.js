import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const proxy = {
  ip: "198.23.239.134",
  port: "6540",
  username: "tcdcmhjv",
  password: "7as9anjfx7gl"
};

const url = 'https://btr.topscripts.in/peter_boyle@facebook_integration/test.php';

export const runPuppeteerScript=async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      `--proxy-server=${proxy.ip}:${proxy.port}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  // Authenticate proxy
  await page.authenticate({
    username: proxy.username,
    password: proxy.password
  });

  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Puppeteer Bot)'
  });

  const response = await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  const content = await page.content();
  console.log(`Status: ${response.status()}`);
  console.log(content);

  await browser.close();
};
