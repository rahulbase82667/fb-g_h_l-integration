import db from '../config/database.js';

export class FacebookAccount {
  static async findByUserId(userId) {
    try {
      const query = `
        SELECT * FROM facebook_accounts 
        WHERE user_id = ? AND status = 'active'
      `;
      const [rows] = await db.execute(query, [userId]);
      return rows;
    } catch (error) {
      throw new Error(`Failed to find Facebook accounts: ${error.message}`);
    }
  }
  
  static async findByFacebookUserId(facebookUserId) {
    try {
      const query = `
        SELECT * FROM facebook_accounts 
        WHERE facebook_user_id = ? AND status = 'active'
      `;
      const [rows] = await db.execute(query, [facebookUserId]);
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to find Facebook account: ${error.message}`);
    }
  }
  
  static async updateToken(id, newToken) {
    try {
      const query = `
        UPDATE facebook_accounts 
        SET access_token = ?, token_expires_at = DATE_ADD(NOW(), INTERVAL 60 DAY)
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [newToken, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to update token: ${error.message}`);
    }
  }
  
  static async getExpiringSoon() {
    try {
      const query = `
        SELECT * FROM facebook_accounts 
        WHERE token_expires_at < DATE_ADD(NOW(), INTERVAL 7 DAY)
        AND status = 'active'
      `;
      const [rows] = await db.execute(query);
      return rows;
    } catch (error) {
      throw new Error(`Failed to get expiring accounts: ${error.message}`);
    }
  }
}