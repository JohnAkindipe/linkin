import { RATE_LIMIT, RATE_WINDOW_MS } from "./config.js";

// Rate limit store: { [ip]: { count: number, windowStart: ISO string } }
const rateLimitStore = {};

export function rateLimiter(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const record = rateLimitStore[ip];

  // If this is the first time any ip is making a request
  // or if it has been more than an hour since the last request window for this ip started.
  if (!record || now - new Date(record.windowStart).getTime() > RATE_WINDOW_MS) {
    rateLimitStore[ip] = { count: 1, windowStart: new Date().toISOString() };
    return next();
  }

  // If the same ip has made more than 5 requests.
  if (record.count >= RATE_LIMIT) {
    return res.status(429).json({ error: "Rate limit exceeded. Max 5 links per hour." });
  }

  // If the ip has made previous requests within the current window and has not exceeded the limit.
  record.count++;
  next();
}
