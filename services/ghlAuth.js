// services/ghlAuth.js
import axios from 'axios';
import db from '../config/database.js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_OAUTH_BASE = 'https://marketplace.gohighlevel.com/oauth';

// Exchange authorization code for access token
export const exchangeCodeForToken = async (code) => {
  try {
    const response = await axios.post(`${GHL_OAUTH_BASE}/token`,JSON.stringify({
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.GHL_REDIRECT_URI
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data;
  } catch (error) {
    console.error('GHL token exchange error:', error.response?.data);
    throw new Error(`GHL token exchange failed: ${error.response?.data?.error || error.message}`);
  }
};

// Get GHL user info and locations
export const getGHLUserInfo = async (accessToken) => {
  try {
    const response = await axios.get(`${GHL_API_BASE}/users/`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28'
      }
    });

    return response.data;
  } catch (error) {
    console.error('GHL user info error:', error.response?.data);
    throw new Error(`Failed to get GHL user info: ${error.response?.data?.message || error.message}`);
  }
};

// Get GHL locations for the user
export const getGHLLocations = async (accessToken) => {
  try {
    const response = await axios.get(`${GHL_API_BASE}/locations/`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28'
      }
    });

    return response.data.locations || [];
  } catch (error) {
    console.error('GHL locations error:', error.response?.data);
    throw new Error(`Failed to get GHL locations: ${error.response?.data?.message || error.message}`);
  }
};

// Refresh GHL access token
export const refreshGHLToken = async (refreshToken) => {
  try {
    const response = await axios.post(`${GHL_OAUTH_BASE}/token`, {
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data;
  } catch (error) {
    console.error('GHL token refresh error:', error.response?.data);
    throw new Error(`GHL token refresh failed: ${error.response?.data?.error || error.message}`);
  }
};

// Validate GHL token
export const validateGHLToken = async (accessToken) => {
  try {
    const response = await axios.get(`${GHL_API_BASE}/users/`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28'
      }
    });

    return response.status === 200;
  } catch (error) {
    return false;
  }
};

// Store GHL account in database
export const storeGHLAccount = async (userId, tokenData, userInfo, selectedLocationId = null) => {
  try {
    const query = `
      INSERT INTO ghl_accounts 
      (user_id, ghl_user_id, access_token, refresh_token, location_id, location_name, 
       token_expires_at, scope, status) 
      VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, 'active')
      ON DUPLICATE KEY UPDATE 
      access_token = VALUES(access_token),
      refresh_token = VALUES(refresh_token),
      location_id = VALUES(location_id),
      location_name = VALUES(location_name),
      token_expires_at = VALUES(token_expires_at),
      scope = VALUES(scope),
      status = 'active'
    `;

    // Get location name if locationId provided
    let locationName = null;
    if (selectedLocationId && tokenData.access_token) {
      try {
        const locations = await getGHLLocations(tokenData.access_token);
        const selectedLocation = locations.find(loc => loc.id === selectedLocationId);
        locationName = selectedLocation?.name || null;
      } catch (error) {
        console.warn('Could not fetch location name:', error.message);
      }
    }

    const [result] = await db.execute(query, [
      userId,
      userInfo.id,
      tokenData.access_token,
      tokenData.refresh_token,
      selectedLocationId,
      locationName,
      tokenData.expires_in || 86400, // Default 24 hours
      tokenData.scope || 'locations/read contacts/write'
    ]);

    return result.insertId || result.affectedRows;
  } catch (error) {
    console.error('Store GHL account error:', error);
    throw new Error(`Failed to store GHL account: ${error.message}`);
  }
};

// Test GHL API connection
export const testGHLConnection = async (accessToken, locationId) => {
  try {
    // Test basic API access
    const userInfo = await getGHLUserInfo(accessToken);
    
    // Test location-specific access if locationId provided
    if (locationId) {
      const contactsResponse = await axios.get(`${GHL_API_BASE}/contacts/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28'
        },
        params: {
          locationId: locationId,
          limit: 1
        }
      });
    }

    return {
      success: true,
      userInfo: userInfo,
      message: 'GHL connection successful'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'GHL connection failed'
    };
  }
};