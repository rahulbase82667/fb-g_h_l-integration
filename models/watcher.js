import { query } from "../config/database.js"; 

export const getChats = async () => {
    const sql = "SELECT * FROM watcher where status = 0";
    const rows= await query(sql);
    console.log(rows);
    return rows;
};

export const addChats = async (chatList, fb_account_id) => {
  console.log('adding chats to watcher -=')
  if (chatList.length === 0) return;
  console.log(chatList);
  const values = chatList.map(chat => [chat, fb_account_id]);
  const placeholders = values.map(() => '(?, ?)').join(', ');

//   return placeholders
  const sql = `INSERT INTO watcher (chat_url, fb_account_id) VALUES ${placeholders}`;
  const flattenedParams = values.flat();
//   return flattenedParams
// // return sql; 
  const result = await query(sql, flattenedParams);
  return result.insertId;
};

export const updateChats=async(chatUrl) => {
    const sql = "UPDATE watcher SET status = 1 WHERE chat_url = ?";
    const params = [chatUrl];
    const result = await query(sql, params);
    return result.affectedRows;
}

export const deleteChat = async (chatUrl) => {
    const sql = "DELETE FROM watcher WHERE chat_url = ?";
    const params = [chatUrl];
    const [result] = await query(sql, params);
    return result.affectedRows;
};



export const deleteAllChats = async () => {
    const sql = "DELETE FROM watcher where status = 1";
    const result = await query(sql);
    return result.affectedRows;
};