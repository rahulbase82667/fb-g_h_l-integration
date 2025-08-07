import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { 
  exchangeCodeForToken, 
  getFacebookUserInfo, 
  storeFacebookAccount 
} from '../services/facebookAuth.js';
import db from '../config/database.js';

const router = express.Router();

// Generate Facebook OAuth URL
router.get('/auth-url', authenticateToken, (req, res) => {
  try {
    const redirectUri = `${process.env.BASE_URL}/auth/facebook/callback`;
    const scope = 'pages_messaging,pages_manage_metadata,pages_read_engagement';
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${process.env.FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&response_type=code` +
      `&state=${req.user.id}`;
    
    res.json({ success: true, authUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Handle Facebook OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code missing' });
    }
    
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);
    
    // Get user info from Facebook
    const facebookUserData = await getFacebookUserInfo(accessToken);
    
    // Store Facebook account
    await storeFacebookAccount(userId, facebookUserData, accessToken);
    
    res.json({ 
      success: true, 
      message: 'Facebook account connected successfully',
      account: {
        facebook_user_id: facebookUserData.id,
        name: facebookUserData.name
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get connected Facebook accounts
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT id, facebook_user_id, account_name, status, created_at 
      FROM facebook_accounts
      WHERE user_id = ? AND status = 'active'
    `;
    
    const [accounts] = await db.execute(query, [req.user.id]);
    
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove Facebook account
router.delete('/accounts/:id', authenticateToken, async (req, res) => {
  try {
    const query = `
      UPDATE facebook_accounts 
      SET status = 'inactive' 
      WHERE id = ? AND user_id = ?
    `;
    
    const [result] = await db.execute(query, [req.params.id, req.user.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    res.json({ success: true, message: 'Facebook account removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;