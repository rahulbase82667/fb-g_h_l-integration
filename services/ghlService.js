// ghlServer.js
import axios from "axios";
import { decrypt } from "../utils/encryption.js";
import { getGhlAccountsByUserId } from "../models/GHLAccount.js";
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

    try {
        const ghl = await getGhlAccountsByUserId(userId);
        if (!ghl) throw new Error(`No GHL account found for user ${userId}`);

        const { location_id, private_integration_key, custom_field_id } = ghl;
        if (!location_id || !private_integration_key || !custom_field_id)
            throw new Error(`Incomplete GHL data for user ${userId}`);
        const apiKey = decrypt(private_integration_key);

        return {
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
export async function createContact(userId, contactData) {
    const name={
        fullname:`${contactData.fbAccoutName}[${contactData.chatPartner}]`,
        firstname:contactData.fbAccoutName,
        lastname: contactData.chatPartner,
    }

    const url = `${GHL_API_URL}/contacts/`;
    try {
        if (!userId) throw new Error("Missing userId");
        const ghl = getAccountData(userId);

        const contactData = {
            "firstName": name.firstname,
            "lastName": name.lastname,
            "name":name.fullname,
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

        const response = await axios.post(url, contactData, {
            headers: ghl.headers
        });

        console.log("✅ Contact created successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error creating contact:", error.response?.data || error.message);
        throw error;
    }
}

export async function searchContactByThreadId(threadId, locationId, page = 1, pageLimit = 20) {
    const url = `${GHL_API_URL}/contacts/search`;
    const data = {
        locationId,
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
            headers: headers,
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


export async function createConversation(locationId, contactId) {
    const url = `${GHL_API_URL}/conversations/`;
    const data = { locationId, contactId };

    try {
        const response = await axios.post(url, data, {
            headers: headers,
        });

        console.log("✅ Conversation created successfully:", response.data);
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

export async function getMessagesByConversationId(conversationId, lastMessageId) {
    ``
    const url = `${GHL_API_URL}/conversations/${conversationId}/messages?limit=100${lastMessageId ? `&lastMessageId=${lastMessageId}` : ''}`;

    try {
        const response = await axios.get(url, {
            headers: headers,
        });

        console.log("✅ Messages fetched successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching messages:", error.response?.data || error.message);
        throw error;
    }
}

export async function sendInboundMessage(conversationId, message) {
    const url = `${GHL_API_URL}/conversations/messages/inbound`;
    const data = {
        type: "FB",
        message,
        conversationId
    };

    try {
        const response = await axios.post(url, data, {
            headers: headers,
        });

        console.log("✅ Message sent successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error sending message:", error.response?.data || error.message);
        throw error;
    }
}

export async function sendOutboundMessage(contactId, message) {
    const url = `${GHL_API_URL}/conversations/messages`;
    const data = {
        type: "Live_Chat",
        contactId,
        message,
        status: "delivered"
    };

    try {
        const response = await axios.post(url, data, {
            headers: headers,
        });

        console.log("✅ Outbound message sent successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ Error sending outbound message:", error.response?.data || error.message);
        throw error;
    }
}




export async function createContactAndConversationInGhl(data) {
    if (!data.userId || !data.firstName || !data.lastname || !data.threadId) {
        throw new Error("Missing required fields");
    }
    const ghl = getAccountData(data.userId);

    const contactData = {
        firstName: data.firstName,
        lastName: data.lastname,
        customFields: [
            {
                id: ghl.customFieldId,
                key: "facebook_thread_id",
                fieldValue: data.threadId,
            },
        ],
    };

}






