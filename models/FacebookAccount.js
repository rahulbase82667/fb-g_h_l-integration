// models/facebookAccount.js
import { query } from "../config/database.js";

/**
 * Create a new Facebook account record
 */
export async function createFacebookAccount(data) {
  console.log(data);
  try {
    if (!data.userId || !data.passwordEncrypted) {
      throw new Error("userId and passwordEncrypted are required");
    }

    const result = await query(
      `INSERT INTO fb_accounts 
      (user_id, account_name, email, phone_number, password_encrypted, proxy_url, login_status, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active', 'active')`,
      [
        data.userId,
        data.accountName || null,
        data.email || null,
        data.phoneNumber || null,
        data.passwordEncrypted,
        data.proxyUrl || null,
      ]
    );

    return result.insertId;
  } catch (error) {
    console.error("DB Error: createFacebookAccount:", error.message);
    throw new Error("Failed to create Facebook account");
  }
}

/**
 * Get all Facebook accounts
 */
export async function getFacebookAccounts() {
  try {
    const rows = await query("SELECT * FROM fb_accounts");
    return rows;
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}
/**
 * Get a single Facebook account by ID
 */
export async function getFacebookAccountById(id) {

  try {
    if (!id) throw new Error("Account ID is required");

    const rows = await query(`SELECT * FROM fb_accounts WHERE id = ?`, [
      id,
    ]);

    if (!rows || rows.length === 0) {
      throw new Error("Facebook account not found");
    }

    return rows[0]; // return single account object
  } catch (error) {
    console.error("DB Error: getFacebookAccountById:", error.message);
    throw new Error(error.message || "Failed to fetch Facebook account");
  }
}

/**
 * Update a Facebook account by ID
 */
export async function updateFacebookAccount(id, data) {
  try {
    if (!id) throw new Error("Account ID is required");

    const result = await query("UPDATE fb_accounts SET session_cookies = ?, last_login= ?, login_status= ? WHERE id = ?", [
      data.session_cookies,
      data.last_login,
      data.login_status,
      id,
    ]);

    if (result.affectedRows === 0) {
      throw new Error("Facebook account not found");
    }

    return result;
  } catch (error) {
    console.error("DB Error: updateFacebookAccount:", error.message);
    throw new Error(error.message || "Failed to update Facebook account");
  }
}

/**
 * Delete a Facebook account by ID
 */
export async function deleteFacebookAccount(id) {
  try {
    if (!id) throw new Error("Account ID is required");

    const result = await query("DELETE FROM fb_accounts WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      throw new Error("Facebook account not found");
    }

    return result;
  } catch (error) {
    console.error("DB Error: deleteFacebookAccount:", error.message);
    throw new Error(error.message || "Failed to delete Facebook account");
  }
}



export default {
  createFacebookAccount,
  getFacebookAccounts,
  updateFacebookAccount,
  deleteFacebookAccount,
  getFacebookAccountById,
};