// services/tokenRefreshJob.js
import cron from 'node-cron';
import { FacebookAccount } from '../models/FacebookAccount.js';
import { refreshFacebookToken, validateFacebookToken } from './facebookAuth.js';

// Run every day at 2 AM
const startTokenRefreshJob = () => {
  cron.schedule('0 2 * * *', async () => {
    console.log(' Starting daily token refresh job...');
    
    try {
      // Get accounts expiring within 7 days
      const expiringAccounts = await FacebookAccount.getExpiringSoon();
      
      console.log(`Found ${expiringAccounts.length} accounts needing token refresh`);
      
      for (const account of expiringAccounts) {
        try {
          // First validate if current token still works
          const isValid = await validateFacebookToken(account.access_token);
          
          if (isValid) {
            // Token is still valid, try to refresh for extended period
            const newToken = await refreshFacebookToken(account.access_token);
            
            // Update in database
            const updated = await FacebookAccount.updateToken(account.id, newToken);
            
            if (updated) {
              console.log(` Refreshed token for account ${account.facebook_user_id}`);
            }
          } else {
            // Token is invalid, mark account as needs re-authentication
            await FacebookAccount.markAsExpired(account.id);
            console.log(` Token expired for account ${account.facebook_user_id} - needs re-auth`);
          }
          
        } catch (error) {
          console.error(`Failed to refresh token for account ${account.id}:`, error.message);
          // Mark as needs attention
          await FacebookAccount.markAsNeedsAttention(account.id);
        }
      }
      
    } catch (error) {
      console.error('Token refresh job failed:', error.message);
    }
  });
  
  console.log('Token refresh cron job scheduled for 2:00 AM daily');
};

export default startTokenRefreshJob;