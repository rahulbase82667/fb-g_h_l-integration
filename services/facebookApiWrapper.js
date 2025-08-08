// services/facebookApiWrapper.js
import axios from 'axios';
import { FacebookAccount } from '../models/FacebookAccount.js';
import { refreshFacebookToken } from './facebookAuth.js';

const FACEBOOK_API_BASE = 'https://graph.facebook.com/v23.0';

// Wrapper function that automatically handles token refresh
export const makeAuthenticatedFacebookRequest = async (account, endpoint, params = {}) => {
  try {
    // First attempt with current token
    const response = await axios.get(`${FACEBOOK_API_BASE}${endpoint}`, {
      params: {
        access_token: account.access_token,
        ...params
      }
    }); 
    
    return response.data;
    
  } catch (error) {
    // Check if error is due to invalid/expired token
    if (error.response?.status === 401 || 
        error.response?.data?.error?.code === 190) {
      
      console.log(`🔄 Token expired for account ${account.facebook_user_id}, attempting refresh...`);
      
      try {
        // Attempt to refresh token
        const newToken = await refreshFacebookToken(account.access_token);
        
        // Update in database
        await FacebookAccount.updateToken(account.id, newToken);
        
        // Retry the original request with new token
        const retryResponse = await axios.get(`${FACEBOOK_API_BASE}${endpoint}`, {
          params: {
            access_token: newToken,
            ...params
          }
        });
        
        console.log(` Token refreshed and request successful for account ${account.facebook_user_id}`);
        return retryResponse.data;
        
      } catch (refreshError) {
        console.error(` Token refresh failed for account ${account.facebook_user_id}:`, refreshError.message);
        throw new Error('Token refresh failed - user needs to re-authenticate');
      }
    }
    
    // If it's not a token error, throw the original error
    throw error;
  }
};

// Example usage functions
export const getFacebookPages = async (accountId) => {
  const account = await FacebookAccount.findById(accountId);
  if (!account) throw new Error('Facebook account not found');
  
  return await makeAuthenticatedFacebookRequest(
    account, 
    '/me/accounts',
    { fields: 'id,name,access_token' }
  );
};

export const sendFacebookMessage = async (accountId, recipientId, message) => {
  const account = await FacebookAccount.findById(accountId);
  if (!account) throw new Error('Facebook account not found');
  
  // This would be a POST request - you'd need to modify the wrapper for POST
  return await makeAuthenticatedFacebookRequest(
    account,
    `/me/messages`,
    { 
      recipient: { id: recipientId },
      message: { text: message }
    }
  );
};