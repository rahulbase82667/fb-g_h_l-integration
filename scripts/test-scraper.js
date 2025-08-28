import { scrapeMarketplaceMessages,scrapeChatList } from "../services/scrapeMarketplaceMessages.js";

(async () => {
  const data = await scrapeChatList(1); // test account ID
  console.log(JSON.stringify(data, null, 2));
})();
