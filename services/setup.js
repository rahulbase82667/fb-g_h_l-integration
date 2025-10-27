import { loginFacebookAccount } from "./puppeteerLogin.js";
import { fbAccountsForSetup } from "../models/FacebookAccount.js";
import { scrapeAllChats } from "./scrapeMarketplaceMessages.js";
export async function setup(id) {
    try {
        const fbAccounts = await fbAccountsForSetup(1);
        for (let i = 0; i < fbAccounts.length; i++) {

            try {
                const scrapeResult = await scrapeAllChats(fbAccounts[i]);
                return scrapeResult; // Return after successful scrape
            } catch (scrapeError) {
                console.error(`Error scraping chats for account ${fbAccounts[i].id}:`, scrapeError);
                // Optionally update status to indicate scrape failure or continue trying other accounts
            }
        }
    } catch (error) {
        console.error('Error fetching Facebook accounts for setup:', error);
        throw error; // Rethrow or handle globally
    }
}
