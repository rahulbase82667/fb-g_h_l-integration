// models/GHLAccount.js
import { query } from '../config/database.js';
import { encrypt } from '../utils/encryption.js';

// Get GHL account by ID
export async function getGHLAccountById(id) {
  if (!id) throw new Error("GHL Account ID is required");

  try {
    const result = await query('SELECT * FROM ghl_accounts WHERE id = ?', [id]);
    return result[0] || null;
  } catch (error) {
    console.error('DB Error: getGHLAccountById:', error.message);
    throw new Error('Failed to fetch GHL account');
  }
}

// Get all GHL accounts for a specific user
export async function getGhlAccountsByUserId(userId) {
  if (!userId) throw new Error("User ID is required");

  try {
    const result = await query('SELECT * FROM ghl_accounts WHERE user_id = ?', [userId]);
    return result[0] || null;
  } catch (error) {
    console.error('DB Error: getGhlAccountsByUserId:', error.message);
    throw new Error('Failed to fetch user GHL accounts');
  }
}

// Create new GHL account
export async function createGhlAccount(data) {
  try {
    if (!data.userId || !data.locationId || !data.privateIntegrationKey) {
      throw new Error("userId, locationId, and privateIntegrationKey are required");
    }

    // Optionally encrypt sensitive keys before saving
    const encryptedKey = data.privateIntegrationKey
      ? encrypt(data.privateIntegrationKey)
      : null;

    const result = await query(
      `INSERT INTO ghl_accounts 
      (user_id, name, location_id, private_integration_key)
      VALUES (?, ?, ?, ?)`,
      [
        data.userId,
        data.name || null,
        data.locationId,
        encryptedKey,
      ]
    );

    return result.insertId;
  } catch (error) {
    console.error('DB Error: createGhlAccount:', error.message);
    throw new Error('Failed to create GHL account');
  }
}

// Update existing GHL account
export async function updateGhlAccount(id, data) {
  if (!id) throw new Error("GHL Account ID is required");
  console.log(data);
  try {
    const encryptedKey = data.private_integration_key
      ? encrypt(data.private_integration_key)
      : null;

    const result = await query(
      `UPDATE ghl_accounts
       SET name = ?, 
           location_id = ?, 
           private_integration_key = ?
       WHERE id = ?`,
      [
        data.name || null,
        data.location_id || null,
        encryptedKey,
        id,
      ]
    );

    return result.affectedRows;
  } catch (error) {
    console.error('DB Error: updateGhlAccount:', error.message);
    throw new Error('Failed to update GHL account');
  }
}

// Delete GHL account
export async function deleteGhlAccount(id) {
  if (!id) throw new Error("GHL Account ID is required");

  try {
    const result = await query('DELETE FROM ghl_accounts WHERE id = ?', [id]);
    return result.affectedRows;
  } catch (error) {
    console.error('DB Error: deleteGhlAccount:', error.message);
    throw new Error('Failed to delete GHL account');
  }
}
