import { Worker } from "bullmq";
import Redis from "ioredis";
import { loginFacebookAccount } from "../services/puppeteerLogin.js";
// import { setSocketIO } from "./scraperWorker.js"; // or create shared socket util

// const connection = new Redis(process.env.REDIS_URL);
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null  
});

let io;
export function setSocketIO(ioInstance) {
  io = ioInstance;
}

const worker = new Worker(
  "loginQueue",
  async (job) => {
    const { accountId } = job.data;

    console.log(`🔑 Worker started login job ${job.id} for account ${accountId}`);
    if (io) io.emit("login-started", { accountId });

    try {
      const result = await loginFacebookAccount(accountId);

      if (result.success) {
        if (io) io.emit("login-completed", { accountId });

        console.log(
          `✅ Login successful for account ${accountId}, cookies stored in DB`
        );
      } else {
        if (io) io.emit("login-failed", { accountId, error: result.error });

        console.warn(`⚠️ Login failed for account ${accountId}:`, result.error);
      }

      return result;
    } catch (err) {
      if (io) io.emit("login-failed", { accountId, error: err.message });

      console.error(`❌ Login worker error for ${accountId}:`, err.message);
      throw err;
    }
  },
  { connection }  
);

// Log job events
worker.on("completed", (job, result) => {
  console.log(
    `🎉 Login job ${job.id} completed for account ${job.data.accountId}`,
    result
  );
}); 

worker.on("failed", (job, err) => {
  console.error(
    
    `💥 Login job ${job?.id} failed for account ${job?.data?.accountId}:`,
    err.message
  );
});
