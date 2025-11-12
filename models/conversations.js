import db from "../config/database.js";
import { chatData } from "./chatUrls.js";
import { createContactAndConversationInGhl } from "../services/ghlService.js";
export async function createConversation(chatUrl, chatPartner, fb_account_id, totalMessages, scrapedAt) {
  // console.log('facebook Account Id', fb_account_id);
  const [accountData] = await db.query('SELECT user_id, account_name FROM fb_accounts WHERE id=?', [fb_account_id]);
  // console.log(accountData)
  const data = {
    userId: accountData[0].user_id,
    fbAccoutName: accountData[0].account_name,
    threadId: chatUrl.split("/").filter(Boolean).pop(),
    chatPartner
  }
  const [result] = await db.query(
    `INSERT INTO conversations (chat_url, chat_partner,fb_account_id, total_messages, scraped_at)
    VALUES (?, ?,?, ?, ?)
    ON DUPLICATE KEY UPDATE chat_partner=VALUES(chat_partner), total_messages=VALUES(total_messages), scraped_at=VALUES(scraped_at)`,
    [chatUrl, chatPartner, fb_account_id, totalMessages, scrapedAt]
  );
  const account = await createContactAndConversationInGhl(data);
  return result.insertId;
}

export async function getConversationByUrl(chatUrl) {
  // console.log(chatUrl)
  const [rows] = await db.query(`SELECT * FROM conversations WHERE chat_url = ?`, [chatUrl]);
  console.log(rows);
  return rows[0];
}

export async function appendToConversations(accountId, chatUrl) {
  // console.log('this is url', chatUrl);
  if (!chatUrl || !accountId) throw new Error('chatUrl and accountId are required');
  const allConversations = await chatData(accountId);
  const urls = JSON.parse(allConversations.map(entry => entry.url));
  const chatdata = urls.filter(convo => convo.chatUrl == chatUrl);
  if (chatdata.length > 0) {
    let test = await createConversation(chatUrl, chatdata[0].chatPartner, accountId, null, null);
    return test;
  };
  return false;
}

export async function updateInitalScrapeStatus(chat_url) {
  return await db.query('UPDATE conversations SET initial_scrape_status = 1 WHERE chat_url = ?', [chat_url]);
}
export async function getInitalScrapeStatus(chat_url) {
  return await db.query('SELECT initial_scrape_status FROM conversations WHERE chat_url = ?', [chat_url]);
}
export async function deleteConversations(id) {

}

export async function getConversationByThreadId(threadId) {
  const likePattern = `%${threadId}%`;
  const [rows] = await db.query(
    'SELECT * FROM conversations WHERE chat_url LIKE ?',
    [likePattern]
  );
  return rows[0];
}
export async function updateGhlConversationId(id, ghlConversationId) {
  if (!id || !ghlConversationId) {
    throw new Error("Both id and ghlConversationId are required");
  }

  const [result] = await db.query(
    `UPDATE conversations 
     SET ghl_conversation_id = ? 
     WHERE id = ?`,
    [ghlConversationId, id]
  );
  return result.affectedRows > 0; // returns true if a row was updated
}

export async function getConversationById(id) {
  const [rows] = await db.query('SELECT * FROM conversations WHERE id = ?', [id]);
  return rows[0];
}