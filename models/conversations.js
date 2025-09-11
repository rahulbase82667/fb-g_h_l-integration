import db from "../config/database.js";

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

