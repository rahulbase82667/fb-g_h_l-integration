// models/facebookAccount.js
import { query } from "../config/database.js";
import { encrypt } from "../utils/encryption.js";
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
      (user_id, account_name, email, phone_number, password_encrypted, session_cookies, proxy_url,proxy_port, proxy_user,proxy_password,  login_status, status)
      VALUES (?, ?, ?,?,?,?,?, ?, ?, ?, 'pending', 'active')`,
      [
        data.userId,
        data.accountName || null,
        data.email || null,
        data.phoneNumber || null,
        data.passwordEncrypted,
        data.session_cookies || null,
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
    if (result.length > 0) {
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
      acc.session_cookies,
      acc.proxyUrl || null,
      acc.proxy_port || null,
      acc.proxy_user || null,
      acc.proxy_password || null,
      'pending',
      'active',
    ]);


    const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const flatValues = values.flat();

    const sql = `
      INSERT INTO fb_accounts 
      (user_id, account_name, email, phone_number, password_encrypted, session_cookies, proxy_url, proxy_port, proxy_user, proxy_password, login_status, status)
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
export async function getFacebookAccounts(userId) {
  try {
    const rows = await query("SELECT id, account_name, user_id, email, phone_number, proxy_url, proxy_user,proxy_port,session_cookies,initial_setup_status, login_status,last_error FROM fb_accounts WHERE user_id = ?", [userId]);
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


export async function updateFacebookAccount(id, data) {
  try {
    if (!id) throw new Error("Account ID is required");

    const fields = [];
    const values = [];

    // Conditionally add updatable fields
    if (data.account_name !== undefined) {
      fields.push("account_name = ?");
      values.push(data.account_name ?? null);
    }
    
    if (data.email !== undefined) {
      fields.push("email = ?");
      values.push(data.email ?? null);
    }

    if (data.phone_number !== undefined) {
      fields.push("phone_number = ?");
      values.push(data.phone_number ?? null);
    }

    if (data.proxy_url !== undefined) {
      fields.push("proxy_url = ?");
      values.push(data.proxy_url ?? null);
    }

    if (data.proxy_user !== undefined) {
      fields.push("proxy_user = ?");
      values.push(data.proxy_user ?? null);
    }

    if (data.proxy_port !== undefined) {
      fields.push("proxy_port = ?");
      values.push(data.proxy_port ?? null);
    }

    if (data.session_cookies !== undefined) {
      fields.push("session_cookies = ?");
      values.push(data.session_cookies ?? null);
    }
    if (data.proxy_password !== undefined) {
      fields.push("proxy_password = ?");
      values.push(encrypt(data.proxy_password) ?? null);
    }

    if (data.last_login !== undefined) {
      fields.push("last_login = ?");
      values.push(data.last_login ?? null);
    }

    if (data.login_status !== undefined) {
      fields.push("login_status = ?");
      values.push(data.login_status ?? null);
    }

    if (data.last_error !== undefined) {
      fields.push("last_error = ?");
      values.push(data.last_error ?? null);
    }
    if (data.error_details !== undefined) {
      fields.push("error_details = ?");
      values.push(data.error_details ?? null);
    }
    if(data.resolve_error_retry_count !== undefined) {
      fields.push("resolve_error_retry_count = ?");
      values.push(data.resolve_error_retry_count ?? null);
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

export async function getIds() {
  try {
    const rows = await query("SELECT id FROM fb_accounts where login_status='active'");
    let ids = rows.map(item => item.id);
    return ids;
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}

export async function fbAccountsForSetup(id) {
  try {
    // const rows = await query("SELECT id FROM fb_accounts WHERE user_id = ?", [id]);
    const rows = await query("SELECT id FROM fb_accounts WHERE user_id = ? AND login_status = 'pending'", [id]);
    // return rows.forEach((item) => item);
    console.log(rows)
    return rows.map(item => item.id);
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}

export async function getAccountsForLoginWatcher(userId) {
  try {
    const rows = await query("SELECT id FROM  fb_accounts");
    if (rows.length == 0) return [];
    const ids = rows.map(item => item.id);
    return ids;
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}


export async function getAccountsWithErrors() {
  try {
    const rows = await query("SELECT id,initial_setup_status,error_details,resolve_error_retry_count FROM  fb_accounts where login_status = 'error' AND last_error !='Cookies Expired'");
    if (rows.length == 0) return [];
    return rows
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }

}
export async function updateInitialSetupStatus(id) {
  if (!id) return false;
  try {
    const result = await query("UPDATE fb_accounts SET initial_setup_status = '1' WHERE id = ?", [id]);
    return result;
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}
export async function getPendingAccounts() {
  try {
    let rows = await query("SELECT id FROM fb_accounts where login_status = 'active' AND initial_setup_status = 0");
    if (rows.length == 0) return [];
    const ids = rows.map(item => item.id);

    return ids
  } catch (error) {
    console.error("DB Error: getFacebookAccounts:", error.message);
    throw new Error("Failed to fetch Facebook accounts");
  }
}
export async function getPendingAccountsAfterActivation(id) {
  try {
    let rows = await query("SELECT id FROM fb_accounts where initial_setup_status = 0 AND id =?",[id]);
    if (rows.length == 0) return [];
    const ids = rows.map(item => item.id);

    return ids
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
  getIds,
  getAccountsForLoginWatcher,
  fbAccountsForSetup,
  getAccountsWithErrors,
  updateInitialSetupStatus,
  getPendingAccounts,
  getPendingAccountsAfterActivation
};