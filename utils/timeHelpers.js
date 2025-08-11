// utils/timeHelpers.js
// Utility functions for handling timestamps in OAuth sessions

export const timeHelpers = {
  
  // Get current timestamp in milliseconds
  now: () => Date.now(),
  
  // Check if session has expired
  isSessionExpired: (sessionTimestamp, maxAgeMs = 1800000) => {
    if (!sessionTimestamp) return true;
    const age = Date.now() - sessionTimestamp;
    return age > maxAgeMs;
  },
  
  // Get session age in different formats
  getSessionAge: (sessionTimestamp) => {
    if (!sessionTimestamp) return null;
    
    const ageMs = Date.now() - sessionTimestamp;
    const ageSeconds = Math.floor(ageMs / 1000);
    const ageMinutes = Math.floor(ageSeconds / 60);
    
    return {
      milliseconds: ageMs,
      seconds: ageSeconds,
      minutes: ageMinutes,
      readable: ageMinutes > 0 ? `${ageMinutes} minutes` : `${ageSeconds} seconds`
    };
  },
  
  // Convert timestamp to readable format
  toReadable: (timestamp) => {
    return new Date(timestamp).toISOString();
  },
  
  // Get expiry time
  getExpiryTime: (timestamp, maxAgeMs = 1800000) => {
    return new Date(timestamp + maxAgeMs).toISOString();
  },
  
  // Debug timestamp information
  debugTimestamp: (sessionTimestamp, maxAgeMs = 1800000) => {
    const now = Date.now();
    const age = now - (sessionTimestamp || 0);
    
    return {
      currentTime: now,
      currentTimeReadable: new Date(now).toISOString(),
      sessionStartTime: sessionTimestamp,
      sessionStartReadable: sessionTimestamp ? new Date(sessionTimestamp).toISOString() : 'Not set',
      sessionAge: age,
      sessionAgeMinutes: Math.round(age / 60000),
      maxAgeMinutes: Math.round(maxAgeMs / 60000),
      isExpired: age > maxAgeMs,
      timeUntilExpiry: maxAgeMs - age,
      timeUntilExpiryMinutes: Math.round((maxAgeMs - age) / 60000)
    };
  }
};
export default function isExpired(mysqlTimestampMs) {
  const now = Date.now(); // current time in ms
  const thirtyMinutesMs = 30 * 60 * 1000; // 30 min in ms
  return (now - mysqlTimestampMs) > thirtyMinutesMs;
}
// Example usage in your routes:
/*
import { timeHelpers } from '../utils/timeHelpers.js';
    
// In your callback route:
const debugInfo = timeHelpers.debugTimestamp(req.session.authTimestamp);
console.log('Session debug:', debugInfo);

if (timeHelpers.isSessionExpired(req.session.authTimestamp)) {
  // Handle expired session
}
*/