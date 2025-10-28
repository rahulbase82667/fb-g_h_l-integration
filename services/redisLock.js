import Redis from "ioredis";
import dotenv from 'dotenv';
// const redis = new Redis({
//   host: process.env.REDIS_HOST || "127.0.0.1",
//   port: process.env.REDIS_PORT || 6379,
//   password: process.env.REDIS_PASSWORD || null,
// });
dotenv.config();
const redis = new Redis(process.env.REDIS_URL);

const PREFIX = "scrape_lock:";

/**
 * Try to acquire a lock for a given key (chat URL)
 * @param {string} key - URL or unique identifier
 * @param {number} ttl - lock timeout in seconds (default 15 min)
 * @returns {boolean} - true if lock acquired, false if already locked
 */
export async function acquireLock(key, ttl = 900) {
  const lockKey = PREFIX + key;
  const result = await redis.set(lockKey, "locked", "NX", "EX", ttl);
  return result === "OK"; // true if lock created
}

/**
 * Release lock when done
 * @param {string} key - URL or unique identifier
 */
export async function releaseLock(key) {
  const lockKey = PREFIX + key;
  await redis.del(lockKey);
}

/**
 * Check if a key is locked
 * @param {string} key
 * @returns {boolean}
 */
export async function isLocked(key) {
  const lockKey = PREFIX + key;
  const exists = await redis.exists(lockKey);
  return exists === 1;
}
