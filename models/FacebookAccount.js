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

  // Find by ID
  static async findById(id) {
    try {
      const query = `
      SELECT * FROM facebook_accounts 
      WHERE id = ? AND status = 'active'
    `;
      const [rows] = await db.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to find Facebook account: ${error.message}`);
    }
  }

  // Mark account as expired (needs re-authentication)
  static async markAsExpired(id) {
    try {
      const query = `
      UPDATE facebook_accounts 
      SET status = 'expired', 
          updated_at = NOW()
      WHERE id = ?
    `;
      const [result] = await db.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to mark account as expired: ${error.message}`);
    }
  }

  // Mark account as needing attention
  static async markAsNeedsAttention(id) {
    try {
      const query = `
      UPDATE facebook_accounts 
      SET status = 'needs_attention', 
          updated_at = NOW()
      WHERE id = ?
    `;
      const [result] = await db.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to mark account as needs attention: ${error.message}`);
    }
  }

  // Get all accounts that need user attention
  static async getNeedsAttention() {
    try {
      const query = `
      SELECT fa.*, u.email as user_email 
      FROM facebook_accounts fa
      JOIN users u ON fa.user_id = u.id
      WHERE fa.status IN ('expired', 'needs_attention')
    `;
      const [rows] = await db.execute(query);
      return rows;
    } catch (error) {
      throw new Error(`Failed to get accounts needing attention: ${error.message}`);
    }
  }
}