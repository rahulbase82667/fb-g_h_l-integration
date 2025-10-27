// queues/setupQueue.js
import { Queue } from "bullmq";
import Redis from "ioredis";

// connect to Redis running locally
const connection = new Redis(process.env.REDIS_URL);
// console.log(connection)
export const setupQueue = new Queue("setupQueue", {
  connection,
  defaultJobOptions: {
    attempts: 2, // retry twice if fail
    removeOnComplete: true,
    removeOnFail: false,
  },
});


export default setupQueue;



