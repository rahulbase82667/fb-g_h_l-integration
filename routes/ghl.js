import express from "express";
import {
  createGhlAccount,
  getGhlAccountsByUserId,
  getGHLAccountById,
  updateGhlAccount,
  deleteGhlAccount,
} from "../models/GHLAccount.js";
const router = express.Router();

// Simple test route
router.get("/", (req, res) => {
  res.send("GHL Accounts API is running 🚀");
});

// Create new GHL account
router.post("/create", async (req, res) => {
  try {
    const result = await createGhlAccount(req.body);
    res.status(201).json({ success: true, id: result });
  } catch (error) {
    console.error("Error in /create:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update GHL account by ID
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await updateGhlAccount(id, req.body);
    res.status(200).json({
      success: true,
      message: result ? "GHL account updated successfully" : "No record updated",
    });
  } catch (error) {
    console.error("Error in /update:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete GHL account by ID
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteGhlAccount(id);
    res.status(200).json({
      success: true,
      message: result ? "GHL account deleted successfully" : "No record deleted",
    });
  } catch (error) {
    console.error("Error in /delete:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single GHL account by ID
router.get("/get/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getGhlAccountsByUserId(id);
    if (!result) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in /get:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all GHL accounts by user ID
router.get("/list/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getGhlAccountsByUserId(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in /list:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});



// GHL  ROUTES FOR MANAGING CONTACTS, CONVERSATINOS, AND MESSAGES





export default router;
