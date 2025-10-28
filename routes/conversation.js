import express from "express";
import { getConversationByUrl } from "../models/conversations.js";
import { getChatUrls } from "../models/chatUrls.js";

const router=express.Router();


router.get("/conversations/:accountId", async (req, res) => {
    try {
        const chatUrls = await getChatUrls(req.params.accountId) || [];
        const conversations = [];
        for (const chatUrl of chatUrls) {
            const conversation = await getConversationByUrl(chatUrl);
            conversations.push(conversation);
        }
        res.json({ success: true, conversations });
    } catch (error) {
        console.error("Error getting conversations:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default router;