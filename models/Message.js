import db from '../config/database.js';

/**
 * Verify messages table structure (using existing table)
 */
export const createMessagesTable = async () => {
  try {
    // Just verify the table exists since you already have it
    const [rows] = await db.execute("SHOW TABLES LIKE 'messages'");
    
    if (rows.length === 0) {
      throw new Error('Messages table does not exist. Please run the ALTER queries first.');
    }

    console.log('✅ Messages table verified successfully');

  } catch (error) {
    console.error('Error verifying messages table:', error.message);
    throw error;
  }
};

/**
 * Save a new message to the database
 */
export const saveMessage = async (messageData) => {
  try {
    const {
      facebook_message_id,
      facebook_account_id,
      sender_fb_id,
      recipient_fb_id,
      page_id = null,
      message_text = null,
      message_type = 'text',
      direction,
      timestamp,
      attachments = null,
      status = 'unread',
      platform = 'facebook_marketplace',
      contact_id = null, // Updated to match your existing column name
      processed = false
    } = messageData;

    // Validate required fields
    if (!facebook_message_id || !facebook_account_id || !sender_fb_id || !recipient_fb_id || !direction || !timestamp) {
      throw new Error('Missing required fields for message');
    }

    const insertQuery = `
      INSERT INTO messages (
        facebook_message_id,
        facebook_account_id,
        sender_fb_id,
        recipient_fb_id,
        page_id,
        message_text,
        message_type,
        direction,
        timestamp,
        attachments,
        marketplace_data,
        status,
        platform,
        contact_id,
        processed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      facebook_message_id,
      facebook_account_id,
      sender_fb_id,
      recipient_fb_id,
      page_id,
      message_text,
      message_type,
      direction,
      timestamp,
      attachments ? JSON.stringify(attachments) : null,
      null, // marketplace_data - will be populated later
      status,
      platform,
      contact_id,
      processed
    ];

    const [result] = await db.execute(insertQuery, values);

    // Fetch the created message
    const [rows] = await db.execute(
      'SELECT * FROM messages WHERE id = ?',
      [result.insertId]
    );

    console.log(`✅ Message saved with ID: ${result.insertId}`);
    return rows[0];

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log(`⚠️ Message ${messageData.facebook_message_id} already exists`);
      return await findMessageById(messageData.facebook_message_id);
    }
    console.error('Error saving message:', error.message);
    throw error;
  }
};

/**
 * Find message by Facebook message ID
 */
export const findMessageById = async (facebookMessageId) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM messages WHERE facebook_message_id = ?',
      [facebookMessageId]
    );

    return rows.length > 0 ? rows[0] : null;

  } catch (error) {
    console.error('Error finding message by ID:', error.message);
    throw error;
  }
};

/**
 * Get messages for a specific Facebook account
 */
export const getMessagesByFacebookAccount = async (facebookAccountId, limit = 50, offset = 0) => {
  try {
    const query = `
      SELECT m.*, fa.account_name, fa.facebook_user_id
      FROM messages m
      JOIN facebook_accounts fa ON m.facebook_account_id = fa.id
      WHERE m.facebook_account_id = ?
      ORDER BY m.timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.execute(query, [facebookAccountId, limit, offset]);
    return rows;

  } catch (error) {
    console.error('Error getting messages by Facebook account:', error.message);
    throw error;
  }
};

/**
 * Get unprocessed messages (for GHL forwarding)
 */
export const getUnprocessedMessages = async (limit = 10) => {
  try {
    const query = `
      SELECT m.*, fa.account_name, fa.facebook_user_id
      FROM messages m
      JOIN facebook_accounts fa ON m.facebook_account_id = fa.id
      WHERE m.processed = FALSE AND m.direction = 'inbound'
      ORDER BY m.timestamp ASC
      LIMIT ?
    `;

    const [rows] = await db.execute(query, [limit]);
    return rows;

  } catch (error) {
    console.error('Error getting unprocessed messages:', error.message);
    throw error;
  }
};

/**
 * Mark message as processed
 */
export const markMessageAsProcessed = async (messageId) => {
  try {
    const [result] = await db.execute(
      'UPDATE messages SET processed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [messageId]
    );

    return result.affectedRows > 0;

  } catch (error) {
    console.error('Error marking message as processed:', error.message);
    throw error;
  }
};

/**
 * Update message status
 */
export const updateMessageStatus = async (messageId, status) => {
  try {
    const validStatuses = ['unread', 'read', 'replied', 'delivered', 'failed'];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const [result] = await db.execute(
      'UPDATE messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, messageId]
    );

    return result.affectedRows > 0;

  } catch (error) {
    console.error('Error updating message status:', error.message);
    throw error;
  }
};

/**
 * Get conversation history between two users
 */
export const getConversationHistory = async (facebookAccountId, senderFbId, limit = 20) => {
  try {
    const query = `
      SELECT * FROM messages 
      WHERE facebook_account_id = ? 
      AND (sender_fb_id = ? OR recipient_fb_id = ?)
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const [rows] = await db.execute(query, [facebookAccountId, senderFbId, senderFbId, limit]);
    return rows.reverse(); // Return in chronological order

  } catch (error) {
    console.error('Error getting conversation history:', error.message);
    throw error;
  }
};

/**
 * Get message statistics for dashboard
 */
export const getMessageStats = async (facebookAccountId, days = 7) => {
  try {
    const query = `
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total_messages,
        SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound_messages,
        SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound_messages,
        SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) as unread_messages
      FROM messages
      WHERE facebook_account_id = ?
      AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `;

    const [rows] = await db.execute(query, [facebookAccountId, days]);
    return rows;

  } catch (error) {
    console.error('Error getting message stats:', error.message);
    throw error;
  }
};

/**
 * Search messages by text content
 */
export const searchMessages = async (facebookAccountId, searchTerm, limit = 20) => {
  try {
    const query = `
      SELECT m.*, fa.account_name
      FROM messages m
      JOIN facebook_accounts fa ON m.facebook_account_id = fa.id
      WHERE m.facebook_account_id = ?
      AND m.message_text LIKE ?
      ORDER BY m.timestamp DESC
      LIMIT ?
    `;

    const searchPattern = `%${searchTerm}%`;
    const [rows] = await db.execute(query, [facebookAccountId, searchPattern, limit]);
    return rows;

  } catch (error) {
    console.error('Error searching messages:', error.message);
    throw error;
  }
};