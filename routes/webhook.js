import express from 'express';
import { processIncomingMessage, verifyWebhook } from '../services/messageProcessor.js';

const router = express.Router();

// Webhook verification endpoint (GET)
router.get('/facebook', async (req, res) => {
  try {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    
    // Verify webhook token
    const isValid = await verifyWebhook(mode, token);
    
    if (isValid) {
      console.log('✅ Facebook webhook verified successfully');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ Facebook webhook verification failed');
      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden - Invalid verify token' 
      });
    }
  } catch (error) {
    console.error('Facebook webhook verification error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Webhook verification failed' 
    });
  }
});

// Message receiving endpoint (POST)
router.post('/facebook', async (req, res) => {
  try {
    const { body } = req;
    
    // Validate webhook payload
    if (!body || !body.entry) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid webhook payload' 
      });
    }

    console.log('📨 Received Facebook webhook:', JSON.stringify(body, null, 2));

    // Process each entry in the webhook
    for (const entry of body.entry) {
      if (entry.messaging) {
        // Process each message in the entry
        for (const message of entry.messaging) {
          try {
            await processIncomingMessage(message, entry.id);
          } catch (messageError) {
            console.error('Error processing individual message:', messageError.message);
            // Continue processing other messages even if one fails
          }
        }
      }
    }

    // Always return 200 OK to Facebook
    res.status(200).json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('Facebook webhook processing error:', error.message);
    // Still return 200 to prevent Facebook from retrying
    res.status(200).json({ success: false, error: 'Processing failed' });
  }
});

// Health check endpoint for webhook
router.get('/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Webhook service is running',
    timestamp: new Date().toISOString()
  });
});

export default router;