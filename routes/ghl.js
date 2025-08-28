// routes/ghl.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
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


const router = express.Router();




global.userId = null;
// Generate GHL OAuth URL
router.get('/auth-url', authenticateToken, (req, res) => {
  try {
    // useful
    // &loginWindowOpenMode=self
    const scope = 'locations/read contacts/write contacts/read conversations/write conversations/read';
    global.userId = req.user.id;
    const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?` +
      `response_type=code` +
      `&client_id=${process.env.GHL_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(process.env.GHL_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${req.user.id}` +
      `&loginWindowOpenMode=self`;

    res.json({
      success: true,
      authUrl,
      message: 'Click the URL to connect your GHL account',
    });

  } catch (error) {
    console.error('GHL auth URL error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Handle GHL OAuth callback old method
// router.get('/callback', async (req, res) => {
//   try {
//     console.log('testing here::',global.userId)
//     console.log('Query params:', req.query);
//     const { code, location_id } = req.query;

//     if (!code) {
//       return res.status(400).json({
//         success: false,
//         error: 'Authorization code missing from GHL callback'
//       });
//     }


//     const userId = global.userId;


//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         error: 'OAuth session expired or user ID missing. Please try connecting again.',
//         needs_restart: true,
//         userId:global.userId
//       });
//     }


//     console.log('Processing GHL OAuth callback for user:', userId);
//     console.log('Authorization code received, location_id:', location_id);

//     // Exchange code for tokens
//     const tokenData = await exchangeCodeForToken(code);
//     // return res.json(tokenData);

//     // console.log(tokenData);
//     console.log('Token exchange successful');

//     // Get user info
//     const userInfo = await getGHLUserInfo(tokenData.access_token,tokenData.userId);
//     console.log('User info retrieved:', userInfo.email);  

//     // Store GHL account
//     const accountId = await storeGHLAccount(userId, tokenData, userInfo, location_id);
//     console.log('GHL account stored with ID:', accountId);

//     // Test connection
//     const connectionTest = await testGHLConnection(tokenData.access_token, userId);



//     // Return success response
//     res.json({
//       success: true,
//       message: 'GHL account connected successfully',
//       account: {
//         id: accountId,
//         ghl_user_id: userInfo.id,
//         email: userInfo.email,
//         location_id: location_id,
//         location_name: userInfo.companyName || 'Not specified',
//         connection_test: connectionTest
//       }
//     });

//   } catch (error) {
//     console.error('GHL callback error:', error);


//     res.status(500).json({
//       success: false,
//       error: error.message,
//       suggestion: 'Please try connecting your GHL account again.'
//     });
//   }
// });
// Handle GHL OAuth callback new method
router.get('/callback', (req, res) => {
  // NOTE: do NOT attempt to attach to user here.
  // Just render a small page to postMessage back to the opener.
  res.send(`
    <!doctype html>
    <html>
      <body>
        <script>
          (function() {
            const params = new URLSearchParams(window.location.search);
            const data = {
              code: params.get('code'),
              location_id: params.get('location_id'),
              error: params.get('error')
            };
            // IMPORTANT: replace '*' with your exact origin in production
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ type: 'GHL_OAUTH', data }, window.location.origin);
            }
            // close after sending
            setTimeout(() => window.close(), 500);
          })();
        </script>
        <p>Finishing authentication — you can close this window.</p>
      </body>
    </html>
  `);
});
router.post('/exchange-code', authenticateToken, async (req, res) => {
  try {
    const { code, location_id } = req.body;
    const tokenData = await exchangeCodeForToken(code); // your service
    const userInfo = await getGHLUserInfo(tokenData.access_token, tokenData.userId);
    const accountId = await storeGHLAccount(req.user.id, tokenData, userInfo, location_id);
    res.json({ success: true, accountId });
  } catch (err) {
    console.error('exchange error', err);
    res.status(500).json({ success: false, error: err.message });
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