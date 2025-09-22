//routes/scrapeRoutes.js
import express from "express";
import { scrapeQueue } from "../queues/scrapeQueue.js";
import loginQueue from "../queues/loginQueue.js";
const router = express.Router();

// enqueue scrape job
router.post("/chats/:accountId", async (req, res) => {
  const { accountId } = req.params;

  // put job in queue
  const job = await scrapeQueue.add("scrape-account", { accountId });

  res.json({ success: true, jobId: job.id, accountId });
});

router.post("/chats/single/:accountId", async (req, res) => {
  const { accountId } = req.params;  
  const chatUrl = req.body.chatUrl;
  // console.log(`chat is :${chatUrl}`);  
  // put job in queue
  const job = await scrapeQueue.add("scrape-account", { accountId,chatUrl });
  // console.log(job);
  res.json({ success: true, jobId: job.id, accountId });
});
export default router;
