import { query } from "../config/database.js";

export async function addChatUrls(accountId, chatUrls) {
    try {
        if (!accountId) throw new Error("Account ID is required");
        if (!chatUrls) throw new Error("Chat urls is required");

        const result = await query("INSERT INTO chatUrls (fb_account_id,url) VALUES (?,?)", [
            accountId,
            JSON.stringify(chatUrls)
        ]);
        return result;

    } catch (e) {
        console.error("DB Error: addChatUrls:", e.message);
        throw new Error(e.message || "Failed to add chat urls");
    }
}
export async function getChatUrls(accountId) {
    try {
        if (!accountId) throw new Error("Account ID is required");

        const rows = await query(`SELECT * FROM chatUrls WHERE fb_account_id = ?`, [
            accountId,
        ]);

        if (!rows || rows.length === 0) {
            // throw new Error("Chat urls not found");
            return null;
        }   
        let chatUrls=JSON.parse(rows[0].url).map(entry => entry.chatUrl);
        return chatUrls;

    } catch (e) {
        console.error("DB Error: getChatUrls:", e.message);
        throw new Error(e.message || "Failed to get chat urls");
    }
}

export async function updateChatUrls(accountId,chatUrls) {
    try {
        if (!accountId) throw new Error("Account ID is required");
        if(!chatUrls || chatUrls.length === 0) throw new Error("Chat urls is required");
        const rows = await query(`UPDATE chatUrls SET url = ? WHERE fb_account_id = ?`, [
            chatUrls,accountId,
        ]);

        if (!rows || rows.length === 0) {
            throw new Error("Chat urls not found");
        }
        

        return rows;

    } catch (e) {
        console.error("DB Error: getChatUrls:", e.message);
        throw new Error(e.message || "Failed to get chat urls");
    }
}
export default {
    addChatUrls,
    getChatUrls,
    updateChatUrls
}