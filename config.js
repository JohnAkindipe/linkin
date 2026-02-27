export const PORT = process.env.PORT || 3000;
export const DB_FILE = "./db.json";
export const RATE_LIMIT = 5;                          // max requests per window
export const RATE_WINDOW_MS = 60 * 60 * 1000;         // 1 hour in ms
export const EXPIRY_MS = 168 * 60 * 60 * 1000;        // 168 hours in ms (i.e. 1 week)
export const LAST_ACCESS_LIMIT = 72 * 60 * 60 * 1000; // 72 hours in ms (i.e. 3 days)
