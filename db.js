import { readFileSync, writeFileSync, existsSync } from "fs";
import { DB_FILE, LAST_ACCESS_LIMIT } from "./config.js";

// In-memory cache
let dbCache = {};

export function getCache() {
  return dbCache;
}

export function loadDB() {
  if (existsSync(DB_FILE)) {
    dbCache = JSON.parse(readFileSync(DB_FILE, "utf8"));
  }
}

// setTimeout returns a unique id (an integer) which we assign to the saveTimer variable.
// If bufferedSave is called before the scheduled write to the file, saveTimer is still
// set, so the function returns immediately.
// When the scheduled write occurs, saveTimer is reset to null, allowing subsequent calls
// to bufferedSave to schedule another write. The call to writeFileSync can take some time,
// therefore any other calls to bufferedSave while the write is ongoing will not schedule
// another write until the current write finishes.
let saveTimer = null;
export function bufferedSave() {
  if (saveTimer) return; // already queued
  saveTimer = setTimeout(() => {
    writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2));
    saveTimer = null;
  }, 200);
}

// ─── Automatic Recycle ──────────────────────────────────────────────────────────
// If the current time is greater than the expiry or if the time since last accessed
// is greater than the expiry limit, the entry is deleted from the cache and we update
// the db file. (However, we update the db file only if the cache changed during cleanup)
export function recycle() {
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
