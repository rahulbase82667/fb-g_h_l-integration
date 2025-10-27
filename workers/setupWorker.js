// import { Worker } from "bullmq";
// import Redis from "ioredis";
// import { loginFacebookAccount } from "../services/puppeteerLogin.js";
// import { fbAccountsForSetup } from "../models/FacebookAccount.js";
// import { scrapeAllChats } from "../services/scrapeMarketplaceMessages.js";
// import { logError } from "../utils/logger.js";

// const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

// let io;
// export function setSocketIO(ioInstance) {
//     io = ioInstance;
// }

// const worker = new Worker(
//     "setupQueue",
//     async (job) => {
//         const { id } = job.data; // id can be used if needed for fbAccountsForSetup filtering
//         console.log("Setup worker got job:", job.id, "with id:", id);

//         if (io) {
//             io.emit("setup-started", { jobId: job.id, id });
//         }

//         try {
//             const fbAccounts = await fbAccountsForSetup(1); // You can modify this filter if needed

//             for (let i = 0; i < fbAccounts.length; i++) {
//                 const account = fbAccounts[i];

//                 // Calculate progress as percentage
//                 const progressPercent = Math.round(((i + 1) / fbAccounts.length) * 100);

//                 // Emit progress event with percentage
//                 if (io) {
//                     io.emit("setup-progress", {
//                         jobId: job.id,
//                         currentFbAccountId: account.id,
//                         progress: progressPercent
//                     });
//                 }

//                 try {
//                     const login = await loginFacebookAccount(account);
//                     if (login.success) {
//                         try {
//                             const scrapeResult = await scrapeAllChats(account);
//                             return scrapeResult; // Return after successful scrape
//                         } catch (scrapeError) {
//                             console.error(`Error scraping chats for account ${account.id}:`, scrapeError);
//                         }
//                     } else {
//                         console.warn(`Login failed for account ${account.id}`);
//                     }
//                 } catch (loginError) {
//                     console.error(`Error logging in account ${account.id}:`, loginError);
//                 }
//             }

//             console.warn('No Facebook account logged in successfully.');
//             return null;

//         } catch (error) {
//             console.error('Error fetching Facebook accounts for setup:', error);
//             logError({
//                 filename: "setupWorker.js",
//                 function: "setupQueue",
//                 errorType: "setupError",
//                 message: error.message,
//                 stack: error.stack,
//             });
//             if (io) {
//                 io.emit("setup-failed", { jobId: job.id, id, error: error.message });
//             }
//             throw error;
//         }
//     },
//     { connection }
// );

// worker.on("failed", (job, err) => {
//     console.error("Setup job failed:", job.id, err.message);
// });

// export default worker;

import { Worker } from "bullmq";
import Redis from "ioredis";
import { loginFacebookAccount } from "../services/puppeteerLogin.js";
import { fbAccountsForSetup,updateInitialSetupStatus,getPendingAccountsAfterActivation } from "../models/FacebookAccount.js";
import { scrapeAllChats } from "../services/scrapeMarketplaceMessages.js";
import { logError } from "../utils/logger.js";


const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
    "setupQueue",
    async (job) => {
        const { id,fbAccountId } = job.data; // id can be used if needed for fbAccountsForSetup filtering
        console.log("Setup worker got job:", job.id, "with id:", id);

        console.log(`userId is ${id}, fbAccountId is ${fbAccountId}`);
        // return 
        if (!id) return false;
        
        try {
            let fbAccounts;
            if(fbAccountId){
                fbAccounts = await getPendingAccountsAfterActivation(fbAccountId);
            }
            else{
            fbAccounts = await fbAccountsForSetup(id); // You can modify this filter if needed
            }
            console.log(fbAccounts);
            // return fbAccounts;
            // return 
            for (let i = 0; i < fbAccounts.length; i++) {
                const account = fbAccounts[i];
                console.log(account);
                try {
                    const scrapeResult = await scrapeAllChats(account);
                    // 🔍 Check if scrape failed
                    if (!scrapeResult || scrapeResult.success === false || scrapeResult.data.success === false) {
                        console.warn(
                            `Scrape failed for account ${account}: ${scrapeResult?.error || 'Unknown error'}`
                        );
                        continue; // Try next account
                    }
                    await updateInitialSetupStatus(account)
                    console.log(`Scrape successful for account ${account}`); // Return after successful scrape
                } catch (scrapeError) {
                    console.error(`Error scraping chats for account ${account}:`, scrapeError);
                }
            }
            console.warn('Finished processing all Facebook accounts.');
            return true; // or aggregate result
        } catch (error) {
            console.error('Error fetching Facebook accounts for setup:', error);
            logError({
                filename: "setupWorker.js",
                function: "setupQueue",
                errorType: "setupError",
                message: error.message,
                stack: error.stack,
            });
            // You can log the failure instead of emitting a socket message
            console.error(`Setup failed for job ${job.id}:`, error.message);
            throw error;        
        }
    },
    { connection }
);

worker.on("failed", (job, err) => {
    console.error("Setup job failed:", job.id, err.message);
});

export default worker;
