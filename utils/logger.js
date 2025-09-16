// usage: 
// {
//   "timestamp": "2025-09-12T16:45:32.123Z",
//   "filename": "scraperWorker.js",
//   "function": "scrapeAllChats",
//   "errorType": "ScrapingError",
//   "message": "Chat URLs not found",
//   "stack": "Error: Chat urls not found\n    at scrapeAllChats..."
// }


import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, "../logs/errors.json");
/**
 * Append an error log to logs/errors.json
 * @param {Object} details - Error details
 * @param {string} details.filename - File where error occurred
 * @param {string} details.function - Function name
 * @param {string} details.errorType - Type/category of error
 * @param {string} details.message - Error message
 * @param {string} [details.stack] - Stack trace (optional)
 */
export function logError({ filename, function: fn, errorType, message, stack }) {
  try {
    // Prepare error entry
    const errorEntry = {
      timestamp: new Date().toISOString(),
      filename,
      function: fn,
      errorType,
      message,
      stack,
    };

    // Ensure logs file exists
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
    }

    // Read existing logs
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    logs.push(errorEntry);

    // Write back with pretty print
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    console.error("📝 Error logged:", message);
  } catch (err) {
    console.error("⚠️ Failed to write error log:", err.message);
  }
}
