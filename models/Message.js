import db from "../config/database.js";

export async function createMessage(conversationId, sender, text, timestamp, messageIndex) {
  const [result] = await db.query(
    `INSERT INTO messages (conversation_id, sender, text, timestamp, message_index)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE text=VALUES(text), timestamp=VALUES(timestamp)`,
    [conversationId, sender, text, timestamp, messageIndex]
  );
  return result.insertId;
}

export async function getMessagesByConversation(conversationId) {
  const [rows] = await db.query(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY message_index ASC`, [conversationId]);
  return rows;
}


export async function getLastMessage(conversationId) {
  const [rows] = await db.query(`SELECT * FROM messages WHERE conversation_id = ?  ORDER BY message_index DESC LIMIT 1`, [conversationId, conversationId]);
  return rows[0];
}