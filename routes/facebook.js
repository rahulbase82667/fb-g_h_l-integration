// routes/facebook.js
import express from "express";
import { encrypt } from "../utils/encryption.js";
import { 
  createFacebookAccount, 
  getFacebookAccounts, 
  updateFacebookAccount, 
  deleteFacebookAccount 
} from "../models/FacebookAccount.js";
import { loginFacebookAccount } from "../services/puppeteerLogin.js";

const router = express.Router();

// Add account
router.post("/add", async (req, res) => {
  try {
    const { userId, accountName, email, phoneNumber, password, proxyUrl } = req.body;
    const passwordEncrypted = encrypt(password);

    const accountId = await createFacebookAccount({
      userId, accountName, email, phoneNumber, passwordEncrypted, proxyUrl
    });

    res.status(201).json({ success: true, accountId });
  } catch (error) {
    console.error("Error adding FB account:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// List accounts
router.get("/", async (req, res) => {
  try {
    const accounts = await getFacebookAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } 
});
router.get('/login/:id',(async (req, res) => {
  const accountId = req.params.id;
  console.log(accountId)
  const result = await loginFacebookAccount(accountId); // test with account ID 1
  
  console.log(result);
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
