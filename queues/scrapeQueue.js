// queues/scrapeQueue.js
import { Queue } from "bullmq";
import Redis from "ioredis";

// connect to Redis running locally
// const connection = new Redis(process.env.REDIS_URL);
const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});
// console.log(connection)
export const scrapeQueue = new Queue("scrapeQueue", {
  connection,
  defaultJobOptions: {
    attempts: 2, // retry twice if fail
    removeOnComplete: true,
    removeOnFail: false,
  },
});


export default scrapeQueue;