import db from '../config/database.js';

/**
 * Create messages table if it doesn't exist
 */
export const createMessagesTable = async () => {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facebook_message_id VARCHAR(255) UNIQUE NOT NULL,
        facebook_account_id INT NOT NULL,
        sender_fb_id VARCHAR(255) NOT NULL,
        recipient_fb_id VARCHAR(255) NOT NULL,
        page_id VARCHAR(255),
        message_text TEXT,
        message_type ENUM('text', 'attachment', 'postback', 'received', 'sent') DEFAULT 'text',
        direction ENUM('inbound', 'outbound') NOT NULL,
        timestamp DATETIME NOT NULL,
        attachments JSON,
        status ENUM('unread', 'read', 'replied', 'delivered', 'failed') DEFAULT 'unread',
        platform VARCHAR(50) DEFAULT 'facebook_marketplace',
        ghl_contact_id INT,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_facebook_account_id (facebook_account_id),
        INDEX idx_sender_fb_id (sender_fb_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_status (status),
        INDEX idx_processed (processed),
        FOREIGN KEY (facebook_account_id) REFERENCES facebook_accounts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await db.execute(createTableQuery);
    console.log('✅ Messages table created/verified successfully');

  } catch (error) {
    console.error('Error creating messages table:', error.message);
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
      ghl_contact_id = null,
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
        status,
        platform,
        ghl_contact_id,
        processed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      status,
      platform,
      ghl_contact_id,
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