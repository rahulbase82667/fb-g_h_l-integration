// queues/scrapeQueue.js
import { Queue } from "bullmq";
import Redis from "ioredis";

// connect to Redis running locally
const connection = new Redis(process.env.REDIS_URL);
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