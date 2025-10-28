//convert time string to timestamp
export function convertToTimestamp(dateString) {
    if(dateString === "") return "";
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Handle "today" and "yesterday" cases
    if (dateString.toLowerCase().includes('today')) {
        const timeMatch = dateString.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
            const [hours, minutes] = timeMatch[0].split(':').map(Number);
            now.setHours(hours, minutes, 0, 0);
            return now.getTime();
        }
        return now.setHours(0, 0, 0, 0);
    }
    
    if (dateString.toLowerCase().includes('yesterday')) {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const timeMatch = dateString.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
            const [hours, minutes] = timeMatch[0].split(':').map(Number);
            yesterday.setHours(hours, minutes, 0, 0);
            return yesterday.getTime();
        }
        return yesterday.setHours(0, 0, 0, 0);
    }
    
    // Handle specific dates like "21 August at 17:48"
    const dateRegex = /(\d{1,2})\s+([a-zA-Z]+)(?:\s+at\s+(\d{1,2}:\d{2}))?/;
    const match = dateString.match(dateRegex);
    
    if (!match) {
        return "";
        throw new Error('Invalid date format');
    }
    
    const day = parseInt(match[1]);
    const monthName = match[2];
    const timeString = match[3] || '00:00';
    
    // Convert month name to number (0-11)
    const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    const monthIndex = monthNames.findIndex(
        month => month.toLowerCase() === monthName.toLowerCase()
    );
    
    if (monthIndex === -1) {
        return "";
        throw new Error('Invalid month name'+match); 
    }
    
    // Parse time
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Create date object (assuming current year)
    const date = new Date(currentYear, monthIndex, day, hours, minutes, 0, 0);
    
    // If the date is in the future (like December when it's currently January),
    // assume it's from last year
    if (date > now) {
        date.setFullYear(currentYear - 1);
    }
    
    return date.getTime();
}

// Example usage:
// console.log(convertToTimestamp("21 August at 17:48")); // Timestamp for August 21 this year at 17:48
// console.log(convertToTimestamp("today at 14:30"));     // Timestamp for today at 14:30
// console.log(convertToTimestamp("yesterday"));          // Timestamp for yesterday at 00:00
// console.log(convertToTimestamp("5 December at 09:15")); // Timestamp for December 5

// Helper function to convert timestamp back to readable date (for testing)
export function timestampToDate(timestamp) {
    return new Date(timestamp).toString();
}


/**
 * Waits for a selector with retry on timeout.
 * @param {object} page - Puppeteer page instance
 * @param {string} selector - CSS selector to wait for
 * @param {object} options - Puppeteer waitForSelector options
 * @param {number} retryTimeout - Timeout for retry (default: 120000 ms = 2 minutes)
 * @param {number} maxRetries - Number of retries (default: 1)
 * @returns {Promise<ElementHandle|null>}
 */
export async function waitForSelectorWithRetry(
  page,
  selector,
  options = { timeout: 20000 },
  retryTimeout = 120000,    
  maxRetries = 1
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await page.waitForSelector(selector, options);
    } catch (err) {
      const isTimeout = err.message.includes("Timeout") || err.name === "TimeoutError";

      if (isTimeout && attempt < maxRetries) {
        console.warn(
          `⚠️ [waitForSelectorWithRetry] Timeout waiting for ${selector}. Retrying with ${retryTimeout / 1000}s timeout...`
        );
        await new Promise((r) => setTimeout(r, 2000)); // small delay before retry
        options.timeout = retryTimeout;
      } else {
        console.error(
          `❌ [waitForSelectorWithRetry] Failed to find ${selector} after ${
            attempt + 1
          } attempt(s): ${err.message}`
        );
        return null; // don’t throw — just return null
      }
    }
  }
  return null;
}
