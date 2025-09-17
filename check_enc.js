import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export function testt(){

    const rawKey = String(process.env.ENCRYPTION_KEY || "").trim();
    
    console.log("Raw ENCRYPTION_KEY:", `"${rawKey}"`);
    console.log("Raw key length:", rawKey.length);
    
    const derivedKey = crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("base64")
    .substring(0, 32);
    
    console.log("Derived KEY (base64, 32 chars):", `"${derivedKey}"`);
    console.log("Derived key length:", derivedKey.length);
}
