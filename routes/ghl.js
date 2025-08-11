// routes/ghl.js
import express from 'express';
import session from 'express-session';
import MySQLStore from 'express-mysql-session';
import { authenticateToken } from '../middleware/auth.js';
import { timeHelpers } from '../utils/timeHelpers.js';

import { 
  exchangeCodeForToken, 
  getGHLUserInfo, 
  getGHLLocations,
  storeGHLAccount,
  testGHLConnection,
  refreshGHLToken,
  validateGHLToken
} from '../services/ghlAuth.js';
import { GHLAccount } from '../models/GHLAccount.js';
import pool  from '../config/database.js';

const router = express.Router();

// Session store configuration for production
const MySQLStoreClass = MySQLStore(session);
const sessionStore = new MySQLStoreClass({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 minutes
  expiration: 1800000, // 30 minutes (for OAuth only)
  createDatabaseTable: false, // We created table manually
  schema: {
    tableName: 'oauth_sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
});

// Session middleware for OAuth flows
router.use('/auth-url', session({
  key: 'ghl_oauth_session',
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1800000 // 30 minutes
  }
}));

router.use('/callback', session({
  key: 'ghl_oauth_session',
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1800000 // 30 minutes
  }
}));

// Generate GHL OAuth URL
router.get('/auth-url', authenticateToken, (req, res) => {
  try {
    const scope = 'locations/read contacts/write contacts/read conversations/write conversations/read';
    
    // Store user ID in session for later use
    req.session.userId = req.user.id;
    req.session.authTimestamp = Date.now(); 
    
    console.log('Starting GHL OAuth for user:', req.user.id);
    
    const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?` +
      `response_type=code` +
      `&client_id=${process.env.GHL_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(process.env.GHL_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scope)}`;
    
    res.json({ 
      success: true, 
      authUrl,  
      message: 'Click the URL to connect your GHL account',
      sessionInfo: {
        userId: req.session.userId,
        timestamp: req.session.authTimestamp
      }
    });
  } catch (error) {
    console.error('GHL auth URL error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Handle GHL OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, location_id } = req.query;
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Authorization code missing from GHL callback' 
      });
    }

    // Get user ID from session
    const userId = req.session.userId;
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'OAuth session expired. Please try connecting again.',
        needs_restart: true
      });
    }

    // Check session age (prevent stale sessions)
    const sessionAge = Date.now() - (req.session.authTimestamp || 0);
    // if (sessionAge > 1800000) { // 30 minutes
    const debugInfo = timeHelpers.debugTimestamp(req.session.authTimestamp);
console.log('Session debug:', debugInfo);
if (timeHelpers.isSessionExpired(req.session.authTimestamp)) {

      req.session.destroy();
      return res.status(400).json({
        success: false,
        error: 'OAuth session expired. Please start the connection process again.',
        needs_restart: true
      });
    }

    console.log('Processing GHL OAuth callback for user:', userId);
    console.log('Authorization code received, location_id:', location_id);

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);
    console.log('Token exchange successful');

    // Get user info
    const userInfo = await getGHLUserInfo(tokenData.access_token);
    console.log('User info retrieved:', userInfo.email);

    // Store GHL account
    const accountId = await storeGHLAccount(userId, tokenData, userInfo, location_id);
    console.log('GHL account stored with ID:', accountId);

    // Test connection
    const connectionTest = await testGHLConnection(tokenData.access_token, location_id);

    // Clear the OAuth session after successful connection
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
    });

    // Return success response
    res.json({ 
      success: true, 
      message: 'GHL account connected successfully',
      account: {
        id: accountId,
        ghl_user_id: userInfo.id,
        email: userInfo.email,
        location_id: location_id,
        location_name: userInfo.companyName || 'Not specified',
        connection_test: connectionTest
      }
    });
    
  } catch (error) {
    console.error('GHL callback error:', error);
    
    // Clear session on error
    if (req.session) {
      req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
      });
    }

    res.status(500).json({ 
      success: false, 
      error: error.message,
      suggestion: 'Please try connecting your GHL account again.'
    });
  }
});

// Get connected GHL accounts
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = await GHLAccount.getActiveWithLocations(req.user.id);
    
    res.json({ 
      success: true, 
      accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Get GHL accounts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get GHL locations for a connected account
router.get('/locations/:accountId', authenticateToken, async (req, res) => {
  try {
    const account = await GHLAccount.findById(req.params.accountId);
    
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ 
        success: false, 
        error: 'GHL account not found' 
      });
    }

    // Validate token first
    const isValidToken = await validateGHLToken(account.access_token);
    if (!isValidToken) {
      // Try to refresh token
      try {
        const newTokenData = await refreshGHLToken(account.refresh_token);
        await GHLAccount.updateToken(account.id, newTokenData);
        account.access_token = newTokenData.access_token;
      } catch (refreshError) {
        return res.status(401).json({
          success: false,
          error: 'GHL token expired and refresh failed. Please reconnect.',
          needs_reconnect: true
        });
      }
    }

    const locations = await getGHLLocations(account.access_token);
    
    res.json({ 
      success: true, 
      locations,
      current_location: {
        id: account.location_id,
        name: account.location_name
      }
    });
  } catch (error) {
    console.error('Get GHL locations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update selected location for GHL account
router.put('/accounts/:accountId/location', authenticateToken, async (req, res) => {
  try {
    const { location_id } = req.body;
    
    if (!location_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Location ID is required' 
      });
    }

    const account = await GHLAccount.findById(req.params.accountId);
    
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ 
        success: false, 
        error: 'GHL account not found' 
      });
    }

    // Get location name
    const locations = await getGHLLocations(account.access_token);
    const selectedLocation = locations.find(loc => loc.id === location_id);
    
    if (!selectedLocation) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid location ID' 
      });
    }

    // Update location
    await GHLAccount.updateLocation(account.id, location_id, selectedLocation.name);
    
    res.json({ 
      success: true, 
      message: 'Location updated successfully',
      location: {
        id: location_id,
        name: selectedLocation.name
      }
    });
  } catch (error) {
    console.error('Update GHL location error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test GHL connection
router.post('/test-connection/:accountId', authenticateToken, async (req, res) => {
  try {
    const account = await GHLAccount.findById(req.params.accountId);
    
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ 
        success: false, 
        error: 'GHL account not found' 
      });
    }

    const testResult = await testGHLConnection(account.access_token, account.location_id);
    
    res.json({ 
      success: testResult.success, 
      message: testResult.message,
      error: testResult.error,
      userInfo: testResult.userInfo
    });
  } catch (error) {
    console.error('Test GHL connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refresh GHL token manually
router.post('/refresh-token/:accountId', authenticateToken, async (req, res) => {
  try {
    const account = await GHLAccount.findById(req.params.accountId);
    
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ 
        success: false, 
        error: 'GHL account not found' 
      });
    }

    console.log('Refreshing GHL token for account:', account.id);

    const newTokenData = await refreshGHLToken(account.refresh_token);
    await GHLAccount.updateToken(account.id, newTokenData);

    res.json({ 
      success: true, 
      message: 'GHL token refreshed successfully',
      expires_in: newTokenData.expires_in
    });
    
  } catch (error) {
    console.error('GHL token refresh error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      needs_reconnect: true
    });
  }
});

// Remove GHL account
router.delete('/accounts/:accountId', authenticateToken, async (req, res) => {
  try {
    const removed = await GHLAccount.remove(req.params.accountId, req.user.id);
    
    if (!removed) {
      return res.status(404).json({ 
        success: false, 
        error: 'GHL account not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'GHL account removed successfully' 
    });
  } catch (error) {
    console.error('Remove GHL account error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;