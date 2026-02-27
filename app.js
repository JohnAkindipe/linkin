import express from "express";
import { nanoid } from "nanoid";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", true);
app.use(express.json());

const DB_FILE = "./db.json";
const PORT = process.env.PORT || 3000;

// In-memory cache
let dbCache = {};

// Rate limit store: { [ip]: { count: number, windowStart: ISO string } }
const rateLimitStore = {};
const RATE_LIMIT = 5;           // max requests
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour in ms
const EXPIRY_MS = 168 * 60 * 60 * 1000; // 168 hours in ms (i.e. 1 week)
const LAST_ACCESS_LIMIT = 72 * 60 * 60 * 1000; // 72 hours in ms (i.e. 3 days)

// ─── DB Helpers ───────────────────────────────────────────────────────────────

function loadDB() {
  if (existsSync(DB_FILE)) {
    dbCache = JSON.parse(readFileSync(DB_FILE, "utf8")); //read the db file into memory if it exists.
  }
}

//setTimeout returns a unique id (an integer) which we assign to the saveTimer variable.
//If bufferedSave is called before the scheduled write to the file, saveTimer is still set, so the function returns immediately.
//When the scheduled write occurs, saveTimer is reset to null, allowing subsequent calls to bufferedSave to schedule
//another write. The call to writeFileSync can take some time, therefore any other calls to bufferedSave while the write is ongoing will
//not schedule another write until the current write finishes.
let saveTimer = null;
function bufferedSave() {
  if (saveTimer) return; // already queued
  saveTimer = setTimeout(() => {
    writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2));
    saveTimer = null;
  }, 200); // flush after 200ms of inactivity
}

// ─── Automatic Recycle ──────────────────────────────────────────────────────────────────
//if the current time is greater than the expiry or if the time since last accessed is greater than the expiry limit
//the entry is deleted from the cache and we update the db file. (However, we update the db file only if the cache
//changed during the cleanup)
function recycle() {
  const now = Date.now();
  let changed = false;
  for (const [id, entry] of Object.entries(dbCache)) {
    if (
      now > new Date(entry.expires).getTime() || 
      now - new Date(entry.lastAccessed).getTime() > LAST_ACCESS_LIMIT
    ) {
      delete dbCache[id];
      changed = true;
    }
  }
  if (changed) bufferedSave();
}

// Run cleanup every hour
setInterval(recycle, 60 * 60 * 1000);

// ─── Middleware ───────────────────────────────────────────────────────────────

function rateLimiter(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const record = rateLimitStore[ip];

  //If this is the first time any ip is making a request 
  //or if it has been more than an hour since the last request window for this ip started.
  if (!record || now - new Date(record.windowStart).getTime() > RATE_WINDOW_MS) {
    rateLimitStore[ip] = { count: 1, windowStart: new Date().toISOString() };
    return next();
  }

  //if the same ip has made more than 5 requests.
  if (record.count >= RATE_LIMIT) {
    return res.status(429).json({ error: "Rate limit exceeded. Max 5 links per hour." });
  }

  console.log("record count is:", record.count)
  //if the ip has made previous requests within the current window and has not exceeded the limit.
  record.count++;
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
// POST /shorten — create a shortened URL
app.post("/shorten", rateLimiter, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  console.log(req.ip)

  const id = nanoid(6);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + EXPIRY_MS).toISOString();

  //save the url to in-memory cache and schedule db save.
  dbCache[id] = { originalUrl: url, created: now, expires, lastAccessed: now, clicks: 0 };
  bufferedSave();

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return res.status(201).json({ shortUrl: `${baseUrl}/${id}`, expires });
});

// GET /:id — redirect to original URL
app.get("/:id", (req, res) => {
  const entry = dbCache[req.params.id];

  if (!entry || Date.now() > new Date(entry.expires).getTime()) {
    if (entry) delete dbCache[req.params.id]; // Cleanup if expired
    return res.status(404).sendFile(path.join(__dirname, "not-found.html"));
  }

  // Update analytics & reset expiry on click
  entry.clicks++;
  entry.lastAccessed = new Date().toISOString();
  bufferedSave();

  return res.redirect(302, entry.originalUrl);
});

// GET /:id/stats — analytics for a shortened URL
app.get("/:id/stats", (req, res) => {
  const entry = dbCache[req.params.id];

  if (!entry || Date.now() > new Date(entry.expires).getTime()) {
    if (entry) delete dbCache[req.params.id]; // Cleanup if expired
    return res.status(404).sendFile(path.join(__dirname, "not-found.html"));
  }

  entry.clicks++
  entry.lastAccessed = new Date().toISOString();
  bufferedSave();

  return res.json({
    id: req.params.id,
    originalUrl: entry.originalUrl,
    clicks: entry.clicks,
    created: entry.created,
    expires: entry.expires,
    lastAccessed: entry.lastAccessed,
  });
});

//read db into cache
loadDB();

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));

export default app;