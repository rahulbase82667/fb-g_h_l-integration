import { all } from "axios";
import db from "../config/database.js";
import { chatData } from "./chatUrls.js";
export async function createConversation(chatUrl, chatPartner, totalMessages, scrapedAt) {
  const [result] = await db.query(
    `INSERT INTO conversations (chat_url, chat_partner, total_messages, scraped_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE chat_partner=VALUES(chat_partner), total_messages=VALUES(total_messages), scraped_at=VALUES(scraped_at)`,
    [chatUrl, chatPartner, totalMessages, scrapedAt]
  );
  return result.insertId;
}

export async function getConversationByUrl(chatUrl) {
  const [rows] = await db.query(`SELECT * FROM conversations WHERE chat_url = ?`, [chatUrl]);
  return rows[0];
}

export async function appendToConversations(accountId=1,chatUrl){
  const allConversations = await chatData(accountId);
  const urls=JSON.parse(allConversations.map(entry => entry.url));
  const chatdata=urls.filter(convo => convo.chatUrl == chatUrl);
  if(chatdata.length > 0) {
    let test=await createConversation(chatUrl,chatdata[0].chatPartner,null,null);
    return true
  };
  return false;
}