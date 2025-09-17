// utils/encryption.js
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const ALGORITHM = "aes-256-cbc";
const KEY = crypto.createHash("sha256").update(String(process.env.ENCRYPTION_KEY)).digest("base64").substring(0, 32);
const IV = Buffer.alloc(16, 0); // Static IV for now, can be randomized per entry

export function encrypt(text) {
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decrypt(encryptedText) {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}


// import crypto from "crypto";
// import dotenv from "dotenv";

// dotenv.config();

// const ALGORITHM = "aes-256-cbc";
// const KEY = crypto.createHash("sha256").update(String(process.env.ENCRYPTION_KEY)).digest("base64").substring(0, 32);

// // Encrypt function
// export function encrypt(text) {
//   const iv = crypto.randomBytes(16); // Generate a random 16-byte IV
//   const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
//   let encrypted = cipher.update(text, "utf8", "hex");
//   encrypted += cipher.final("hex");

//   // Return the IV and the encrypted text together (e.g., IV in base64, encrypted text in hex)
//   return iv.toString("base64") + ":" + encrypted;
// }

// // Decrypt function
// export function decrypt(encryptedText) {
//   const [ivBase64, encryptedData] = encryptedText.split(":"); // Split the IV from the encrypted text
//   const iv = Buffer.from(ivBase64, "base64"); // Convert the IV back to buffer

//   const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
//   let decrypted = decipher.update(encryptedData, "hex", "utf8");
//   decrypted += decipher.final("utf8");
//   return decrypted;
// }
