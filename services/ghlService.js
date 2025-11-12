// ghlServer.js
import axios from "axios";
import { decrypt } from "../utils/encryption.js";
import { getGhlAccountsByUserId} from "../models/GHLAccount.js";
import { createGhlContact,insertConversationIdInGhlContact,getGHLAccountByConversationId } from "../models/ghlContacts.js";
import { getConversationByThreadId, updateGhlConversationId,getConversationById } from '../models/conversations.js';
import { convertCookiesPartitionKeyFromPuppeteerToCdp } from "puppeteer";
const GHL_API_URL = "https://services.leadconnectorhq.com";
// const GHL_API_KEY = "pit-f8482fd0-3835-4bd2-8932-8270ab8ee8e8"; // ⚠️ Replace with environment variable in production
const GHL_API_KEY = "pit-296a35b9-efb0-46f7-8ad0-195cf6b820b9"; // ⚠️ Replace with environment variable in production
const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Version": "2021-07-28",
    "Authorization": null,
}

// reusables:



export async function getAccountData(userId) {
    if (!userId) throw new Error("Missing userId");
    console.log(userId);
    try {
        const ghl = await getGhlAccountsByUserId(userId);
        if (!ghl) throw new Error(`No GHL account found for user ${userId}`);

        const { location_id, private_integration_key, custom_field_id } = ghl;
        if (!location_id || !private_integration_key || !custom_field_id)
            throw new Error(`Incomplete GHL data for user ${userId}`);
        const apiKey = decrypt(private_integration_key);

        return {
            id: ghl.id,
            locationId: location_id,
            apiKey,
            customFieldId: custom_field_id,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Version": "2021-07-28",
                "Authorization": `Bearer ${apiKey}`,
            }
        };
    } catch (err) {
        console.error(`[getAccountData] userId=${userId}:`, err.message);
        throw err;
    }
}
/**
 * Create a new contact in GoHighLevel (GHL)
 * @param {Object} contactData - Contact details and custom fields
 */
export async function createContact(ghl, contactData) {
    const name = {
        fullname: `${contactData.fbAccoutName}(${contactData.chatPartner})`,
        firstname: contactData.fbAccoutName,
        lastname: contactData.chatPartner,
    }

    const url = `${GHL_API_URL}/contacts/`;
    try {
        const contact = {
            "firstName": name.accountName,
            "lastName": name.lastname,
            "name": name.fullname,
            "locationId": ghl.locationId,
            "tags": [
                "FB Custom Integration"
            ],
            "source": "public api",
            "customFields": [
                {
                    "id": ghl.customFieldId,
                    "key": "facebook_thread_id",
                    "field_value": contactData.threadId
                }
            ]
        }
        const response = await axios.post(url, contact, {
            headers: ghl.headers
        });
        // console.log("✅ Contact created successfully:", response.data);
        // return response.data;
        let data = { 
            ghlContactId: response.data.contact.id,
            ghlAccountId: ghl.id
        }
        await createGhlContact(data);
        const createdConversation = await createConversation(ghl, response.data.contact.id);
        const dbConversation = await getConversationByThreadId(contactData.threadId);

        const updatedConversationId = await updateGhlConversationId(dbConversation.id, createdConversation.conversation.id);
        const updatedContactInDb=await insertConversationIdInGhlContact(dbConversation.id,response.data.contact.id);
        return { contact: response.data, conversation: createdConversation };
    } catch (error) {
        console.error("❌ Error creating contact:", error.response?.data || error.message);
        throw error;
    }
}

export async function searchContactByThreadId(ghl, threadId, page = 1, pageLimit = 20) {
    const url = `${GHL_API_URL}/contacts/search`;
    const data = {
        locationId: ghl.locationId,
        page,
        pageLimit,
        filters: [
            {
                field: "customFields.facebook_thread_id",
                operator: "eq",
                value: threadId,
            },
        ],
        sort: [
            {
                field: "firstNameLowerCase",
                direction: "asc",
            },
        ],
    };

    try {
        const response = await axios.post(url, data, {
            headers: ghl.headers,
        });

        return response.data;
    } catch (error) {
        console.error("❌ Error searching contact:", error.response?.data || error.message);
        throw error;
    }
}

export async function createCustomField(userId) {
    try {
        if (!userId) throw new Error("Missing userId");
        const ghl = getAccountData(userId);
        const url = `${GHL_API_URL}/locations/${(await ghl).locationId}/customFields`;
        const data = {
            name: "facebook_thread_id",
            dataType: "TEXT",
            placeholder: "Facebook Thread ID (e.g. 742182578820330)",
            model: "contact"
        };

        const response = await axios.post(url, data, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Version": "2021-07-28",
                "Authorization": `Bearer ${ghl.apiKey}`,
            },
        });

        return response.data;
    } catch (error) {
        console.error("❌ Error creating custom field:", error.response?.data || error.message);
        throw error;
    }
}


export async function createConversation(ghl, contactId) {
    const url = `${GHL_API_URL}/conversations/`;
    const data = { locationId: ghl.locationId, contactId: contactId };

    try {
        const response = await axios.post(url, data, {
            headers: ghl.headers,
        });

        // console.log("✅ Conversation created successfully:", response.data);
        return response.data;
    } catch (error) {
        const status = error.response?.status;
        const errData = error.response?.data;

        // ✅ Handle case where conversation already exists
        if (status === 400 && errData?.message === "Conversation already exists" && errData?.conversationId) {
            console.warn("⚠️ Conversation already exists. Returning existing conversation ID:", errData.conversationId);
            return {
                success: true,
                conversation: {
                    id: errData.conversationId,
                    alreadyExists: true,
                },
                traceId: errData.traceId,
            };
        }
        console.error("❌ Error creating conversation:", errData || error.message);
        throw error;
    }
}

export async function getConversation(conversationId = "tq6F0l3qMRb7lNnIoLU0") {

    const url = `${GHL_API_URL}/conversations/${conversationId}`;
    try {
        const response = await axios.get(url, {
            headers: headers,
        });
        return response.data;
    } catch (error) {
        console.error("❌ Error getting conversation:", error.response?.data || error.message);
        throw error;
    }
}

export async function getMessagesByConversationId(ghl, conversationId, lastMessageId) {
    const url = `${GHL_API_URL}/conversations/${conversationId}/messages?limit=100${lastMessageId ? `&lastMessageId=${lastMessageId}` : ''}`;

    try {
        const response = await axios.get(url, {
            headers: ghl.headers,
        });

        console.log("✅ Messages fetched successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching messages:", error.response?.data || error.message);
        throw error;
    }
}


export async function sendInboundMessage(ghl, conversationId = "6U1Ux33VsadD0CF8lrgU", message = "test message") {
    console.log(`conversationId is ${conversationId}`)
    const url = `${GHL_API_URL}/conversations/messages/inbound`;
    const data = {
        type: "FB",
        message,
        conversationId
    };

    try {
        const response = await axios.post(url, data, {
            headers: ghl.headers,
        });

        console.log("✅ Message sent successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error sending message:", error.response?.data || error.message);
        throw error;
    }
}

export async function sendOutboundMessage(ghl, contactId, message) {
    const url = `${GHL_API_URL}/conversations/messages`;
    const data = {
        type: "Live_Chat",
        contactId,
        message,
        status: "delivered"
    };
    try {
        const response = await axios.post(url, data, {
            headers: ghl.headers,
        });

        console.log("✅ Outbound message sent successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error sending outbound message:", error.response?.data || error.message);
        throw error;
    }
}
export async function createContactAndConversationInGhl(data) {
    if (!data.userId || !data.fbAccoutName || !data.threadId || !data.chatPartner) {
        throw new Error("Missing required fields");
    }
    // const ghl = await getGhlAccountsByUserId(data.userId);
    const ghl = await getAccountData(data.userId);
    const searchContact = await searchContactByThreadId(ghl, data.threadId)
    if (searchContact.total > 0) {
        await createGhlContact({ ghlContactId: searchContact.contacts[0].id, ghlAccountId: ghl.id });
        const createConvo = await createConversation(ghl, searchContact.contacts[0].id);
        const dbConversation = await getConversationByThreadId(data.threadId);
        const updateConvsersationIdIndb = await updateGhlConversationId(createConvo.conversation.id, dbConversation.id);
        return {
            success: true,
            data: {
                conversationId: createConvo.conversation.id,
                contactId: searchContact.contacts[0].id,
                conversation: createConvo
            },
            message: "Contact already exists in GHL, Updated in DB and conversation created successfully"
        }
    }

    // const test=sendInboundMessage(ghl,"lhMNNBOO3qEP8t5hNWFT","test");
    // const test = await sendOutboundMessage(ghl, "FAnTJQ3RDLmlz3UjNDFR", "test completed");

    // console.log(test);
    // return
    // console.log(ghl);
    // return

    if (!ghl) throw new Error(`No GHL account found for user ${data.userId}`);

    const contact = await createContact(ghl, data);
    return {
        successs: true,
        data: contact,
        messsage: "Contact needs to be created"
    }
}


export async function sendMessageToGhl(userId,conversation_id,sender,message) {
    console.log('inside sendMessageToGhl and conversation_id is ',conversation_id);
    try{
    const ghl = await getAccountData(userId);
    let data;
    if (!ghl) throw new Error(`No GHL account found for user ${userId}`);
     if(sender=='You')   {
         const contact=await getGHLAccountByConversationId(conversation_id);
         console.log(contact);
        //  return 
         data=await sendOutboundMessage(ghl,contact.ghl_contact_id,message);
        }else{ 
            const conversationId=await getConversationById(conversation_id);
            data=await sendInboundMessage(ghl, conversationId.ghl_conversation_id, message);
        }    
    return {
        successs: true,
        data: data,
        messsage: "Message sent successfully"
    }}
    catch(err){
        console.error(err)
    }
}



export async function checkForNewMessages(ghl) {
    
}




