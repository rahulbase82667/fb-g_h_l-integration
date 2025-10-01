// models/facebookAccount.js
import { query } from "../config/database.js";

/**
 * Create a new Facebook account record
 */
export async function createFacebookAccount(data) {
  try {
    if (!data.userId || !data.passwordEncrypted) {
      throw new Error("userId and passwordEncrypted are required");
    }

    const result = await query(
      `INSERT INTO fb_accounts 
      (user_id, account_name, email, phone_number, password_encrypted, proxy_url,proxy_port, proxy_user,proxy_password,  login_status, status)
      VALUES (?, ?, ?,?,?,?, ?, ?, ?, 'active', 'active')`,
      [
        data.userId,
        data.accountName || null,
        data.email || null,
        data.phoneNumber || null,
        data.passwordEncrypted,
        data.proxyUrl || null,
        data.proxy_port || null,
        data.proxy_user || null,
        data.proxy_password || null,
      ]
    );

    return result.insertId;
  } catch (error) {
    console.error("DB Error: createFacebookAccount:", error.message);
    throw new Error("Failed to create Facebook account");
  }
}
export async function checkUserExists(data) {
  // return 
  try {
    let result = {};
    if (data.email) {
      result = await query("SELECT id, account_name FROM fb_accounts WHERE email = ?", [
        data.email,
      ]);
    } else {
      result = await query("SELECT id, account_name FROM fb_accounts WHERE phone_number = ?", [
        data.phone_number,
      ]);
    }
    if(result.length > 0){
      return true;
    }
    return false;
  } catch (error) {
    console.error("DB Error: checkUserExists:", error.message);
    throw new Error("Failed to check user existence");
  }
}
/**
 * Bulk create multiple Facebook accounts
 */
export async function bulkCreateFacebookAccounts(userId, accounts) {
  try {
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts provided");
    }

    const values = accounts.map(acc => [
      userId,
      acc.accountName || null,
      acc.email || null,
      acc.phoneNumber || null,
      acc.passwordEncrypted,
      acc.proxyUrl || null,
      acc.proxy_port || null,
      acc.proxy_user || null,
      acc.proxy_password || null,
      'active',
      'active'
    ]);

    const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const flatValues = values.flat();

    const sql = `
      INSERT INTO fb_accounts 
      (user_id, account_name, email, phone_number, password_encrypted, proxy_url, proxy_port, proxy_user, proxy_password, login_status, status)
      VALUES ${placeholders}
    `;

    const result = await query(sql, flatValues);
    return result;
  } catch (error) {
    console.error("DB Error: bulkCreateFacebookAccounts:", error.message);
    throw new Error("Failed to create multiple Facebook accounts");
  }
}


/**
 * Get all Facebook accounts
 */
export async function getFacebookAccounts() {
  try {
    const rows = await query("SELECT id, account_name, user_id, email, phone_number, proxy_url, proxy_user,proxy_port, login_status FROM fb_accounts");
    return rows;
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  } x
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
// export async function updateFacebookAccount(id, data) {
//   try {
//     if (!id) throw new Error("Account ID is required");
//     console.log(data)
//     console.log(`id is : ${id}`)
//     const result = await query("UPDATE fb_accounts SET session_cookies = ?, last_login= ?, login_status= ? WHERE id = ?", [
//       data.session_cookies, 
//       data.last_login,
//       data.login_status,
//       id,
//     ]);

//     if (result.affectedRows === 0) {
//       throw new Error("Facebook account not found");
//     }

//     return result;
//   } catch (error) {
//     console.error("DB Error: updateFacebookAccount:", error.message);
//     throw new Error(error.message || "Failed to update Facebook account");
//   }
// }
export async function updateFacebookAccount(id, data) {
  try {
    if (!id) throw new Error("Account ID is required");

    const fields = [];
    const values = [];

    // Conditionally add session_cookies
    if (data.session_cookies !== undefined) {
      fields.push("session_cookies = ?");
      values.push(data.session_cookies ?? null); // Use null if undefined
    }

    // Conditionally add last_login
    if (data.last_login !== undefined) {
      fields.push("last_login = ?");
      values.push(data.last_login ?? null);
    }

    // Conditionally add login_status
    if (data.login_status !== undefined) {
      fields.push("login_status = ?");
      values.push(data.login_status ?? null);
    }

    if (fields.length === 0) {
      throw new Error("No valid fields provided to update.");
    }

    const queryStr = `UPDATE fb_accounts SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);

    const result = await query(queryStr, values);

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

export async function getIds(){
  try {
    const rows = await query("SELECT id FROM fb_accounts where login_status='active'");
    let ids=rows.map(item => item.id);
    return ids;  
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}

export default {
  createFacebookAccount,
  getFacebookAccounts,
  updateFacebookAccount,
  deleteFacebookAccount,
  getFacebookAccountById,
  checkUserExists,
  bulkCreateFacebookAccounts,
  getIds
};