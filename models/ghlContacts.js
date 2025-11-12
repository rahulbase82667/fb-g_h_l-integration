import { query } from '../config/database.js';

// Get GHL contact by ID
export async function getGHLContactById(id) {
  if (!id) throw new Error("GHL Contact ID is required");

  try {
    const result = await query('SELECT * FROM ghl_contacts WHERE id = ?', [id]);
    return result[0] || null; // Return the first result or null if not found
  } catch (error) {
    console.error('DB Error: getGHLContactById:', error.message);
    throw new Error('Failed to fetch GHL contact');
  }
}
// Get all GHL contacts for a specific GHL account
export async function getGhlContactsByAccountId(ghlAccountId) {
  if (!ghlAccountId) throw new Error("GHL Account ID is required");

  try {
    const result = await query('SELECT * FROM ghl_contacts WHERE ghl_account_id = ?', [ghlAccountId]);
    return result; // Return all contacts associated with the GHL account
  } catch (error) {
    console.error('DB Error: getGhlContactsByAccountId:', error.message);
    throw new Error('Failed to fetch GHL contacts for account');
  }
}
// Create a new GHL contact
export async function createGhlContact(data) {
  // console.log(data)
  try {
    if (!data.ghlContactId || !data.ghlAccountId) {
      throw new Error("ghlContactId and ghlAccountId are required");
    }

    const result = await query(
      `INSERT INTO ghl_contacts 
      (ghl_contact_id, ghl_account_id)
      VALUES (?, ?)`,
      [
        data.ghlContactId,
        data.ghlAccountId,
      ]
    );

    return result.insertId; // Return the ID of the newly inserted contact
  } catch (error) {
    console.error('DB Error: createGhlContact:', error.message);
    throw new Error('Failed to create GHL contact');
  }
}
// Update an existing GHL contact
export async function updateGhlContact(id, data) {
  if (!id) throw new Error("GHL Contact ID is required");

  try {
    const result = await query(
      `UPDATE ghl_contacts
       SET ghl_contact_id = ?, 
           ghl_account_id = ?
       WHERE id = ?`,
      [
        data.ghlContactId || null,
        data.ghlAccountId || null,
        id,
      ]
    );

    return result.affectedRows; // Return the number of affected rows
  } catch (error) {
    console.error('DB Error: updateGhlContact:', error.message);
    throw new Error('Failed to update GHL contact');
  }
}
// Delete a GHL contact
export async function deleteGhlContact(id) {
  if (!id) throw new Error("GHL Contact ID is required");

  try {
    const result = await query('DELETE FROM ghl_contacts WHERE id = ?', [id]);
    return result.affectedRows; // Return the number of affected rows
  } catch (error) {
    console.error('DB Error: deleteGhlContact:', error.message);
    throw new Error('Failed to delete GHL contact');
  }
}

export async function insertConversationIdInGhlContact(id,contactId){
    try {
        const result = await query('UPDATE ghl_contacts SET conversation_id = ? WHERE ghl_contact_id = ?', [id, contactId]);
        return result.affectedRows; // Return the number of affected rows
      } catch (error) {
        console.error('DB Error: deleteGhlContact:', error.message);
        throw new Error('Failed to delete GHL contact');
      }
}

export async function getGHLAccountByConversationId(id) {
  if (!id) throw new Error("Conversatin ID is required");
  // console.log(`id is --------: ${id}`)

  try {
    const [result] = await query('SELECT * FROM ghl_contacts WHERE conversation_id = ?', [id]);
    // console.log(result)
    return result || null;
  } catch (error) { 
    console.error('DB Error: getGHLAccountById:', error.message);
    throw new Error('Failed to fetch GHL account');
  }
}
