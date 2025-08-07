import axios from 'axios';
import db from '../config/database.js';

const FACEBOOK_API_BASE = `https://graph.facebook.com/${process.env.FACEBOOK_API_VERSION}`;

export const exchangeCodeForToken = async (code) => {
   const response = await axios.get(`${FACEBOOK_API_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${process.env.BASE_URL}/api/facebook/callback`,
        // code: code
        fb_exchange_token: code
      }
    });
  console.log(response)return
  try {
  // const response = await axios.get(`${FACEBOOK_API_BASE}/oauth/access_token`, {
    //   params: {
    //     client_id: process.env.FACEBOOK_APP_ID,
    //     client_secret: process.env.FACEBOOK_APP_SECRET,
    //     redirect_uri: `${process.env.BASE_URL}/api/facebook/callback`,
    //     code: code
    //   }
    // });
      const response = await axios.get(`${FACEBOOK_API_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${process.env.BASE_URL}/api/facebook/callback`,
        // code: code
        fb_exchange_token: code
      }
    });
    
    return response.data.access_token;
  } catch (error) {
    throw new Error(`Facebook token exchange failed: ${error.message}`);
  }
};

export const getFacebookUserInfo = async (accessToken) => {
  try {
    const response = await axios.get(`${FACEBOOK_API_BASE}/me`, {
      params: {
        access_token: accessToken,
        fields: 'id,name,email'
      }
    });
    
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get Facebook user info: ${error.message}`);
  }
};

export const validateFacebookToken = async (accessToken) => {
  try {
    const response = await axios.get(`${FACEBOOK_API_BASE}/me`, {
      params: {
        access_token: accessToken,
        fields: 'id'
      }
    });

    return response.data.id ? true : false;
  } catch (error) {
    return false;
  }
};

export const refreshFacebookToken = async (currentToken) => {
  try {
    const response = await axios.get(`${FACEBOOK_API_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: currentToken
      }
    });
    console.log(response)
    return response.data.access_token;
  } catch (error) {
    throw new Error(`Token refresh failed: ${error.message}`);
  }
};

export const storeFacebookAccount = async (userId, facebookUserData, accessToken) => {
  try {
    const query = `
      INSERT INTO facebook_accounts 
      (user_id, facebook_user_id, access_token, account_name, token_expires_at, status) 
      VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 60 DAY), 'active')
      ON DUPLICATE KEY UPDATE 
      access_token = VALUES(access_token),
      account_name = VALUES(account_name),
      token_expires_at = VALUES(token_expires_at),
      status = 'active'
    `;
    
    const [result] = await db.execute(query, [
      userId,
      facebookUserData.id,
      accessToken,
      facebookUserData.name
    ]);
    
    return result.insertId || result.affectedRows;
  } catch (error) {
    throw new Error(`Failed to store Facebook account: ${error.message}`);
  }
};
