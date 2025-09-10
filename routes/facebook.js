// routes/facebook.js
import express from "express";
import { encrypt } from "../utils/encryption.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import ExcelJS from "exceljs";   
import { encrypt } from "../utils/encryption.js";
import {
  createFacebookAccount,
  getFacebookAccounts,
  updateFacebookAccount,
  deleteFacebookAccount
} from "../models/FacebookAccount.js";
import { validate, accountSchema } from './utils/validation.js'; // adjust path
import { loginFacebookAccount } from "../services/puppeteerLogin.js";

const router = express.Router();

// Add account
router.post('/add', validate(accountSchema), async (req, res) => {
  try {
    // req.body is validated and sanitized at this point
    const {
      userId,
      accountName,
      email,
      phoneNumber,
      password,
      proxyUrl,
      proxyPort,
      proxyUser,
      proxyPassword,
    } = req.body;

    const passwordEncrypted = encrypt(password);
    const proxyPasswordEncrypted = proxyPassword ? encrypt(proxyPassword) : null;

    const accountId = await createFacebookAccount({
      userId,
      accountName,
      email,
      phoneNumber,
      passwordEncrypted,
      proxyUrl,
      proxy_port: proxyPort,
      proxy_user: proxyUser,
      proxy_password: proxyPasswordEncrypted,
    });

    res.status(201).json({ success: true, accountId });
  } catch (error) {
    console.error('Error adding FB account:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
/**
 * ✅ Bulk Upload CSV/Excel
 */

const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const filePath = req.file.path;
    const ext = path.extname(filePath).toLowerCase();

    let rows = [];

    if (ext === ".csv") {
      // ✅ CSV parsing
      rows = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on("data", (row) => results.push(row))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    } else if (ext === ".xlsx") {
      // ✅ Excel parsing using ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const sheet = workbook.worksheets[0];
      rows = [];

      // Convert rows to JSON-like objects
      const headers = sheet.getRow(1).values; // first row = headers
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header row
        const rowData = {};
        row.values.forEach((val, i) => {
          if (headers[i]) {
            rowData[headers[i]] = val;
          }
        });
        rows.push(rowData);
      });
    } else {
      throw new Error("Unsupported file type. Please upload .csv or .xlsx");
    }

    const insertedIds = [];
    for (const row of rows) {
      const passwordEncrypted = row["facebook_password"]
        ? encrypt(row["facebook_password"])
        : null;
      const proxyPasswordEncrypted = row["proxy_pass"]
        ? encrypt(row["proxy_pass"])
        : null;

      const accountData = {
        userId: row["facebook_email"] || row["facebook_phone"],
        accountName: row["facebook_email"] || null,
        email: row["facebook_email"] || null,
        phoneNumber: row["facebook_phone"] || null,
        passwordEncrypted,
        proxyUrl: row["proxy_url"] || null,
        proxy_port: row["proxy_port"] || null,
        proxy_user: row["proxy_user"] || null,
        proxy_password: proxyPasswordEncrypted,
      };

      try {
        const id = await createFacebookAccount(accountData);
        insertedIds.push(id);
      } catch (err) {
        console.error("Insert failed for row:", row, err.message);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.status(201).json({
      success: true,
      message: "Accounts imported successfully",
      insertedCount: insertedIds.length,
      insertedIds,
    });
  } catch (error) {
    console.error("Error uploading accounts:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// List accounts
router.get("/accounts", async (req, res) => {
  try {
    const accounts = await getFacebookAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get('/login/:id', (async (req, res) => {
  const accountId = req.params.id;
  console.log(accountId)
  const result = await loginFacebookAccount(accountId); // test with account ID 1

  console.log(result);
  res.json({
    success: result.success,
    accountId: result.accountId,
    message: result.message,
    error: result.error
  });
}));
// Update account
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let updateData = req.body;

    if (updateData.password) {
      updateData.password_encrypted = encrypt(updateData.password);
      delete updateData.password;
    }

    await updateFacebookAccount(id, updateData);
    res.json({ success: true, message: "Account updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete account
router.delete("/:id", async (req, res) => {
  try {
    await deleteFacebookAccount(req.params.id);
    res.json({ success: true, message: "Account deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
