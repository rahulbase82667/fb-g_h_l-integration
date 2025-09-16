// import { Worker } from "bullmq";
// import Redis from "ioredis";

// // 👇 Import your real scraper
// import { scrapeAllChats,scrapeChatList } from "../services/scrapeMarketplaceMessages.js";

// // const connection = new Redis(process.env.REDIS_URL);
// const connection = new Redis(process.env.REDIS_URL, {
//   maxRetriesPerRequest: null
// });

// const worker = new Worker(
//   "scrapeQueue",
//   async (job) => {
//     const { accountId } = job.data;

//     console.log(`📥 Worker started job ${job.id} for account ${accountId}`);

//     // ✅ emit "started"
//     global.io?.emit("scrapeStatus", {
//       accountId,
//       status: "started",
//       message: "Scraping started. This may take a few minutes.",
//     });
//     try {
//    await scrapeChatList(accountId);

//       // 🔹 Run your real scraping function
//       const result = await scrapeAllChats(accountId, true);

//        // ✅ emit "completed"
//       global.io?.emit("scrapeStatus", {
//         accountId,
//         status: "completed",
//         message: `Scraping finished. Total ${result.summary.totalMessages} messages.`,
//         summary: result.summary,
//       });

//       // Return result so BullMQ stores it in Redis
//       return result;
//     } catch (err) {
//       global.io?.emit("scrapeStatus", {
//         accountId,
//         status: "failed",
//         message: `Scraping failed: ${err.message}`,
//       });
//       throw err;
//     }
//   },
//   { connection }
// );

// // Events for logging
// worker.on("completed", (job, result) => {
//   console.log(`🎉 Job ${job.id} completed for account ${job.data.accountId}`);
// });

// worker.on("failed", (job, err) => {
//   console.error(`💥 Job ${job?.id} failed for account ${job?.data?.accountId}:`, err.message);
// });

// export function setSocketIO(io) {
//   global.io = io;
// }
// workers/scraperWorker.js
import { Worker } from "bullmq";
import Redis from "ioredis";
import { scrapeAllChats } from "../services/scrapeMarketplaceMessages.js";
import { logError } from "../utils/logger.js";
// const connection = new Redis(process.env.REDIS_URL);
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});
let io;
export function setSocketIO(ioInstance) {
  io = ioInstance;
}

const worker = new Worker(
  "scrapeQueue",
  async (job) => {
    const { accountId } = job.data;
    console.log("Worker got job:", job.id, "for account:", accountId);

    // 🔌 Notify frontend scraping started
    if (io) {
      io.emit("scrape-started", { accountId, jobId: job.id });
    }

    try {
      // Wrap scrapeAllChats with progress reporting
      const result = await scrapeAllChats(accountId, true, (progress) => {
        if (io) {
          io.emit("scrape-progress", {
            accountId,
            jobId: job.id,
            ...progress, // { current, total, partner }
          });
        }
      });

      console.log("Finished scraping account:", accountId);

      if (io) {
        io.emit("scrape-completed", {
          accountId,
          jobId: job.id,
          summary: result.summary,
        });
      }

      return { status: "done", result };
    } catch (err) {
      // console.error("Scraping failed for account:", accountId, err);
      logError({
        filename: "scraperWorker.js",
        function: "scrapeQueue",
        errorType: "scrapingError",
        message: err.message,
        stack: err.stack,
      });
      if (io) {
        io.emit("scrape-failed", {
          accountId,
          jobId: job.id,
          error: err.message,
        });
      }

      throw err;
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error("Job failed:", job.id, err.message);
});

export default worker;
