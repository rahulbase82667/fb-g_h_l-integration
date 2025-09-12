import express from "express";
import { getLastMessage,getMessagesByConversation } from "../models/Message.js";

const router = express.Router();

router.get("/last/:id", async (req, res) => {
    try {
        const id=req.params.id;
        const lastMessage = await getLastMessage(id||2);
        res.json({ success: true, lastMessage });
    } catch (error) {
        console.error("Error getting last message:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});
router.get('/all/:id', async (req, res) => {
    try {
        const id=req.params.id;
        const messages = await getMessagesByConversation(id||2);
        // console.log(messages);
        res.json({ success: true, messages });
    } catch (error) {
        console.error("Error getting last message:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
})
export default router;