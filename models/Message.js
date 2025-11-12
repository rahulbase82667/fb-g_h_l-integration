import db from "../config/database.js";
import {getConversationByUrl} from "./conversations.js";
import {sendMessageToGhl} from "../services/ghlService.js";


export async function createMessage(conversationId, sender, text, timestamp, messageIndex,userId) {
  console.log('inside createMessage and conversationId is ',conversationId);
  const ghlMessage=await sendMessageToGhl(userId,conversationId,sender,text);
  console.log(ghlMessage)
  const [result] = await db.query(
    `INSERT INTO messages (conversation_id, sender, text, timestamp, message_index, ghl_message_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE text=VALUES(text), timestamp=VALUES(timestamp)`,
    [conversationId, sender, text, timestamp, messageIndex, ghlMessage.messageId||null]
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
export async function updateMessageIndex(chatUrl,text){
  if(!chatUrl || !text) throw new Error('chatUrl and Message is required');
  let conversation=await getConversationByUrl(chatUrl);
  let [index]=await db.query('SELECT MAX(message_index) as `index` FROM messages WHERE conversation_id = ?', [conversation.id]);
  return await createMessage(conversation.id, 'You', text, new Date(), index[0].index+1);

}

export async function updateGhlMessageId(messageId,ghlMessageId){
  return await db.query('UPDATE messages SET ghl_message_id = ? WHERE id = ?', [ghlMessageId,messageId]);
}