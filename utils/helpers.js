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
        throw new Error('Invalid month name');
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

// console.log(timestampToDate(convertToTimestamp("21 August at 17:48")));