// models/GHLAccount.js
import db from '../config/database.js';

export class GHLAccount {
  // Find GHL accounts by user ID
  static async findByUserId(userId) {
    try {
      const query = `
        SELECT * FROM ghl_accounts 
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC
      `;
      const [rows] = await db.execute(query, [userId]);
      return rows;
    } catch (error) {
      throw new Error(`Failed to find GHL accounts: ${error.message}`);
    }
  }

  // Find GHL account by ID
  static async findById(id) {
    try {
      const query = `
        SELECT * FROM ghl_accounts 
        WHERE id = ? AND status = 'active'
      `;
      const [rows] = await db.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to find GHL account: ${error.message}`);
    }
  }

  // Find by GHL user ID
  static async findByGHLUserId(ghlUserId) {
    try {
      const query = `
        SELECT * FROM ghl_accounts 
        WHERE ghl_user_id = ? AND status = 'active'
      `;
      const [rows] = await db.execute(query, [ghlUserId]);
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to find GHL account by GHL user ID: ${error.message}`);
    }
  }

  // Find by location ID
  static async findByLocationId(locationId) {
    try {
      const query = `
        SELECT * FROM ghl_accounts 
        WHERE location_id = ? AND status = 'active'
      `;
      const [rows] = await db.execute(query, [locationId]);
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to find GHL account by location ID: ${error.message}`);
    }
  }

  // Update access token
  static async updateToken(id, tokenData) {
    try {
      const query = `
        UPDATE ghl_accounts 
        SET access_token = ?, 
            refresh_token = ?, 
            token_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
            updated_at = NOW()
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in || 86400,
        id
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to update GHL token: ${error.message}`);
    }
  }

  // Get accounts with expiring tokens (within 1 hour)
  static async getExpiringSoon() {
    try {
      const query = `
        SELECT * FROM ghl_accounts 
        WHERE token_expires_at < DATE_ADD(NOW(), INTERVAL 1 HOUR)
        AND status = 'active'
      `;
      const [rows] = await db.execute(query);
      return rows;
    } catch (error) {
      throw new Error(`Failed to get expiring GHL accounts: ${error.message}`);
    }
  }

  // Mark account as expired
  static async markAsExpired(id) {
    try {
      const query = `
        UPDATE ghl_accounts 
        SET status = 'expired', 
            updated_at = NOW()
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to mark GHL account as expired: ${error.message}`);
    }
  }

  // Mark account as needs attention
  static async markAsNeedsAttention(id) {
    try {
      const query = `
        UPDATE ghl_accounts 
        SET status = 'needs_attention', 
            updated_at = NOW()
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to mark GHL account as needs attention: ${error.message}`);
    }
  }

  // Get all accounts that need attention
  static async getNeedsAttention() {
    try {
      const query = `
        SELECT ga.*, u.email as user_email 
        FROM ghl_accounts ga
        JOIN users u ON ga.user_id = u.id
        WHERE ga.status IN ('expired', 'needs_attention')
      `;
      const [rows] = await db.execute(query);
      return rows;
    } catch (error) {
      throw new Error(`Failed to get GHL accounts needing attention: ${error.message}`);
    }
  }

  // Update location info
  static async updateLocation(id, locationId, locationName) {
    try {
      const query = `
        UPDATE ghl_accounts 
        SET location_id = ?, 
            location_name = ?,
            updated_at = NOW()
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [locationId, locationName, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to update GHL location: ${error.message}`);
    }
  }

  // Remove (deactivate) GHL account
  static async remove(id, userId) {
    try {
      const query = `
        UPDATE ghl_accounts 
        SET status = 'inactive',
            updated_at = NOW()
        WHERE id = ? AND user_id = ?
      `;
      const [result] = await db.execute(query, [id, userId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Failed to remove GHL account: ${error.message}`);
    }
  }

  // Get active accounts with location info
  static async getActiveWithLocations(userId) {
    try {
      const query = `
        SELECT id, ghl_user_id, location_id, location_name, scope, status, created_at
        FROM ghl_accounts 
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC
      `;
      const [rows] = await db.execute(query, [userId]);
      return rows;
    } catch (error) {
      throw new Error(`Failed to get active GHL accounts: ${error.message}`);
    }
  }
}