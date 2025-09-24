// routes/facebook.js
import express from "express";
import { encrypt } from "../utils/encryption.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import ExcelJS from "exceljs";   
import {
  createFacebookAccount,
  getFacebookAccounts,
  updateFacebookAccount,
  deleteFacebookAccount,
  bulkCreateFacebookAccounts,
  checkUserExists 
} from "../models/FacebookAccount.js";
import { validate, accountSchema } from '../utils/validation.js'; // adjust path
import { loginFacebookAccount } from "../services/puppeteerLogin.js";
import crypto from "crypto";
import loginQueue from "../queues/loginQueue.js";
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
    const checkUserExist = await checkUserExists({email, phoneNumber });
    console.log(checkUserExist);
    if(checkUserExist){
          res.status(409).json({ success: false, message: 'Accout with this email or phone number already exists' });

    }
    // return 
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

// ✅ Configure multer to store uploaded files
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }
    const userId=req.body.userId;
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    console.log(`File uploaded to: ${filePath}`);
    console.log(`Original filename: ${req.file.originalname}`);
    console.log(`Detected extension: ${ext}`);

    let rows = [];
    let headers = [];

    // ✅ Required headers
    const requiredHeaders = [
      "facebook_email",
      "facebook_phone",
      "facebook_password",
      "proxy_url",
      "proxy_port",
      "proxy_user",
      "proxy_pass",
    ];

    // ✅ Handle .csv files
    if (ext === ".csv") {
      rows = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on("headers", (fileHeaders) => {
            headers = fileHeaders.map((h) => h.trim().toLowerCase());
          })
          .on("data", (row) => results.push(row))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    }
    
    // ✅ Handle .xlsx files
    else if (ext === ".xlsx") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const sheet = workbook.worksheets[0];

      headers = sheet.getRow(1).values.map((h) =>
        typeof h === "string" ? h.trim().toLowerCase() : h
      );
      rows = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const rowData = {};
        row.values.forEach((val, i) => {
          if (headers[i]) {
            rowData[headers[i]] = val;
          }
        });
        rows.push(rowData);
      });
    }
    // ❌ Unsupported file type
    else {
      fs.unlinkSync(filePath); // cleanup
      throw new Error("Unsupported file type. Please upload .csv or .xlsx");
    }
     

    // ✅ Validate headers
    const missingHeaders = requiredHeaders.filter(
      (h) => !headers.includes(h)
    );
    if (missingHeaders.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: `Missing required headers: ${missingHeaders.join(", ")}`,
      });
    }
    
    // ✅ Map rows into account objects
   rows = rows.map((row) => {
  const normalizedRow = {};
  Object.keys(row).forEach((key) => {
    const cleanKey = key.trim().toLowerCase();
    normalizedRow[cleanKey] = row[key];
  });
  return normalizedRow;
});

const accounts = rows.map((row) => {
  return {
    email: row["facebook_email"] || null,
    phoneNumber: row["facebook_phone"] || null,
    passwordEncrypted: row["facebook_password"]
      ? encrypt(row["facebook_password"])
      : null,
    proxyUrl: row["proxy_url"] || null,
    proxy_port: row["proxy_port"] || null,
    proxy_user: row["proxy_user"] || null,
    proxy_password: row["proxy_pass"] ? encrypt(row["proxy_pass"]) : null,
  };
});

    // console.log(accounts);
    // return 

    // ✅ Bulk insert into DB
    const result = await bulkCreateFacebookAccounts(userId,accounts);
  console.log(result);
    fs.unlinkSync(filePath); // cleanup uploaded file

    res.status(201).json({
      success: true,
      message: "Accounts imported successfully",
      insertedCount: result.affectedRows,
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
    // const conversations=await getConversations();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// router.get('/login/:id', (async (req, res) => {
//   const accountId = req.params.id;
//   console.log(accountId)
//   const result = await loginFacebookAccount(accountId); // test with account ID 1

//   console.log(result);
//   res.json({
//     success: result.success,
//     accountId: result.accountId,
//     message: result.message,
//     error: result.error
//   });
// }));
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
router.post("/login/:accountId", async (req, res) => {
  const { accountId } = req.params;
  console.log('login account triggered')
  try {
    const job = await loginQueue.add("login-account", { accountId });
    return res.json({
      success: true,
      jobId: job.id,
      accountId,
      message: "Login job enqueued",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
export default router;
