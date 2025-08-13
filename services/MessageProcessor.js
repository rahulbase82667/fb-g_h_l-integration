import { saveMessage, findMessageById } from '../models/Message.js';
import findByFacebookUserId  from '../models/FacebookAccount.js';

/**
 * Verify webhook token from Facebook
 */
export const verifyWebhook = async (mode, token) => {
  try {
    const expectedToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    
    if (mode === 'subscribe' && token === expectedToken) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Webhook verification error:', error.message);
    return false;
  }
};

/**
 * Process incoming Facebook message
 */
export const processIncomingMessage = async (messagingEvent, pageId) => {
  try {
    console.log('🔄 Processing message event:', JSON.stringify(messagingEvent, null, 2));

    // Extract message data
    const { sender, recipient, timestamp, message, postback } = messagingEvent;

    // Skip if no sender or recipient
    if (!sender || !recipient) {
      console.log('⚠️ Skipping message - missing sender or recipient');
      return;
    }

    // Find the Facebook account associated with this page
    const facebookAccount = await findByFacebookUserId(recipient.id);
    if (!facebookAccount) {
      console.log(`⚠️ No Facebook account found for page ID: ${recipient.id}`);
      return;
    }

    // Process text message
    if (message && message.text) {
      await processTextMessage({
        senderId: sender.id,
        recipientId: recipient.id,
        pageId,
        messageText: message.text,
        messageId: message.mid,
        timestamp,
        facebookAccountId: facebookAccount.id,
        attachments: message.attachments || []
      });
    }

    // Process postback (button clicks, quick replies, etc.)
    if (postback) {
      await processPostback({
        senderId: sender.id,
        recipientId: recipient.id,
        pageId,
        postbackPayload: postback.payload,
        postbackTitle: postback.title,
        timestamp,
        facebookAccountId: facebookAccount.id
      });
    }

    // Process message delivery confirmation
    if (messagingEvent.delivery) {
      await processDeliveryConfirmation({
        recipientId: recipient.id,
        delivery: messagingEvent.delivery,
        facebookAccountId: facebookAccount.id
      });
    }

    // Process message read confirmation
    if (messagingEvent.read) {
      await processReadConfirmation({
        recipientId: recipient.id,
        read: messagingEvent.read,
        facebookAccountId: facebookAccount.id
      });
    }

  } catch (error) {
    console.error('Error processing incoming message:', error.message);
    throw error;
  }
};

/**
 * Process text message
 */
const processTextMessage = async (messageData) => {
  try {
    const {
      senderId,
      recipientId,
      messageText,
      messageId,
      timestamp,
      facebookAccountId,
      attachments,
      pageId
    } = messageData;

    // Check if message already exists (prevent duplicates)
    const existingMessage = await findMessageById(messageId);
    if (existingMessage) {
      console.log(`⚠️ Message ${messageId} already exists, skipping`);
      return;
    }

    // Validate message content
    if (!validateMessage(messageText, attachments)) {
      console.log('⚠️ Invalid message content, skipping');
      return;
    }

    // Create message object
    const messageObj = {
      facebook_message_id: messageId,
      facebook_account_id: facebookAccountId,
      sender_fb_id: senderId,
      recipient_fb_id: recipientId,
      page_id: pageId,
      message_text: messageText,
      message_type: 'received',
      direction: 'inbound',
      timestamp: new Date(timestamp),
      attachments: JSON.stringify(attachments),
      status: 'unread',
      platform: 'facebook_marketplace'
    };

    // Save message to database
    const savedMessage = await saveMessage(messageObj);
    
    console.log('✅ Message saved successfully:', {
      id: savedMessage.id,
      senderId,
      preview: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '')
    });

    // Extract marketplace-specific data if available
    const marketplaceData = extractMarketplaceData(messageText, attachments);
    if (marketplaceData) {
      console.log('📦 Marketplace data extracted:', marketplaceData);
      // TODO: Save marketplace data when we implement listings
    }

    return savedMessage;

  } catch (error) {
    console.error('Error processing text message:', error.message);
    throw error;
  }
};

/**
 * Process postback (button clicks, quick replies)
 */
const processPostback = async (postbackData) => {
  try {
    const {
      senderId,
      recipientId,
      postbackPayload,
      postbackTitle,
      timestamp,
      facebookAccountId
    } = postbackData;

    console.log('🔘 Processing postback:', {
      senderId,
      payload: postbackPayload,
      title: postbackTitle
    });

    // Create postback message object
    const messageObj = {
      facebook_message_id: `postback_${timestamp}_${senderId}`,
      facebook_account_id: facebookAccountId,
      sender_fb_id: senderId,
      recipient_fb_id: recipientId,
      message_text: `[POSTBACK] ${postbackTitle}`,
      message_type: 'postback',
      direction: 'inbound',
      timestamp: new Date(timestamp),
      attachments: JSON.stringify({ payload: postbackPayload }),
      status: 'unread',
      platform: 'facebook_marketplace'
    };

    await saveMessage(messageObj);
    console.log('✅ Postback saved successfully');

  } catch (error) {
    console.error('Error processing postback:', error.message);
    throw error;
  }
};

/**
 * Process delivery confirmation
 */
const processDeliveryConfirmation = async (deliveryData) => {
  try {
    const { delivery, facebookAccountId } = deliveryData;
    
    console.log('📬 Message delivered:', {
      messageIds: delivery.mids,
      watermark: delivery.watermark
    });

    // TODO: Update message status to 'delivered' in database
    // This will be implemented when we add message status tracking

  } catch (error) {
    console.error('Error processing delivery confirmation:', error.message);
  }
};

/**
 * Process read confirmation
 */
const processReadConfirmation = async (readData) => {
  try {
    const { read, facebookAccountId } = readData;
    
    console.log('👁️ Message read:', {
      watermark: read.watermark
    });

    // TODO: Update message status to 'read' in database
    // This will be implemented when we add message status tracking

  } catch (error) {
    console.error('Error processing read confirmation:', error.message);
  }
};

/**
 * Validate message content
 */
const validateMessage = (text, attachments) => {
  try {
    // Must have either text or attachments
    if (!text && (!attachments || attachments.length === 0)) {
      return false;
    }

    // Text validation
    if (text) {
      // Check for minimum length
      if (text.trim().length === 0) {
        return false;
      }
      
      // Check for maximum length (Facebook's limit is ~2000 characters)
      if (text.length > 2000) {
        console.log('⚠️ Message text too long, truncating');
        return false;
      }
    }

    // Attachments validation
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (!attachment.type) {
          return false;
        }
      }
    }

    return true;

  } catch (error) {
    console.error('Message validation error:', error.message);
    return false;
  }
};

/**
 * Extract marketplace-specific data from message
 */
const extractMarketplaceData = (messageText, attachments) => {
  try {
    const marketplaceData = {};

    // Extract common marketplace patterns
    const patterns = {
      price: /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
      phone: /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g,
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      location: /(in\s+[A-Za-z\s,]+|near\s+[A-Za-z\s,]+)/gi
    };

    // Extract data using patterns
    Object.keys(patterns).forEach(key => {
      const matches = messageText.match(patterns[key]);
      if (matches) {
        marketplaceData[key] = matches;
      }
    });

    // Extract attachment data
    if (attachments && attachments.length > 0) {
      marketplaceData.attachments = attachments.map(att => ({
        type: att.type,
        url: att.payload?.url || null
      }));
    }

    return Object.keys(marketplaceData).length > 0 ? marketplaceData : null;

  } catch (error) {
    console.error('Error extracting marketplace data:', error.message);
    return null;
  }
};