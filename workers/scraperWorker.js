import { Worker } from "bullmq";
import Redis from "ioredis";
import { scrapeAllChats, scrapeSingleChat } from "../services/scrapeMarketplaceMessages.js";
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
    const { accountId, chatUrl } = job.data;
    // console.log(job.data)
    console.log("Worker got job:", job.id, "for account:", accountId);
    // return;
    let isSingleChat = false;
    if (chatUrl) { isSingleChat = true;console.log("single chat")  }
      console.log('running now')
    // 🔌 Notify frontend scraping started
    if (io) {
      io.emit("scrape-started", { accountId, jobId: job.id });
    }
    try {
      let result;
      // Wrap scrapeAllChats with progress reporting
      if(!isSingleChat){result = await scrapeAllChats(accountId, true, (progress) => {
        if (io) {
          io.emit("scrape-progress", {
            accountId,
            jobId: job.id,
            ...progress, // { current, total, partner }
          });
        }
      });
    }else{result = await scrapeSingleChat(accountId, chatUrl, (progress) => {
        if (io) {
          io.emit("scrape-progress", {
            accountId,
            jobId: job.id,
            ...progress, // { current, total, partner }
          });
        }
      });
    }
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
      console.error("Scraping failed for account:", accountId, err);
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
