import { Router } from "express";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import path from "path";
import { EXPIRY_MS } from "./config.js";
import { getCache, bufferedSave } from "./db.js";
import { rateLimiter } from "./middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/**
 * @swagger
 * /shorten:
 *   post:
 *     summary: Shorten a URL
 *     description: Creates a shortened URL. Rate limited to 5 requests per hour per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 example: https://example.com
 *     responses:
 *       201:
 *         description: URL shortened successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 shortUrl:
 *                   type: string
 *                   example: https://your-app.up.railway.app/aBc123
 *                 expires:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing url in request body
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/shorten", rateLimiter, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  const dbCache = getCache();
  const id = nanoid(6);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + EXPIRY_MS).toISOString();

  dbCache[id] = { originalUrl: url, created: now, expires, lastAccessed: now, clicks: 0 };
  bufferedSave();

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return res.status(201).json({ shortUrl: `${baseUrl}/${id}`, expires });
});

/**
 * @swagger
 * /{id}:
 *   get:
 *     summary: Redirect to original URL
 *     description: Redirects to the original URL associated with the given short ID. Increments the click counter.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The short URL ID
 *     responses:
 *       302:
 *         description: Redirect to the original URL
 *       404:
 *         description: Invalid or expired link
 */
router.get("/:id", (req, res) => {
  const dbCache = getCache();
  const entry = dbCache[req.params.id];

  if (!entry || Date.now() > new Date(entry.expires).getTime()) {
    if (entry) delete dbCache[req.params.id];
    return res.status(404).sendFile(path.join(__dirname, "not-found.html"));
  }

  entry.clicks++;
  entry.lastAccessed = new Date().toISOString();
  bufferedSave();

  return res.redirect(302, entry.originalUrl);
});

/**
 * @swagger
 * /{id}/stats:
 *   get:
 *     summary: Get analytics for a shortened URL
 *     description: Returns click count, creation date, expiry, and last accessed time for a shortened URL.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The short URL ID
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 originalUrl:
 *                   type: string
 *                 clicks:
 *                   type: integer
 *                 created:
 *                   type: string
 *                   format: date-time
 *                 expires:
 *                   type: string
 *                   format: date-time
 *                 lastAccessed:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Invalid or expired link
 */
router.get("/:id/stats", (req, res) => {
  const dbCache = getCache();
  const entry = dbCache[req.params.id];

  if (!entry || Date.now() > new Date(entry.expires).getTime()) {
    if (entry) delete dbCache[req.params.id];
    return res.status(404).sendFile(path.join(__dirname, "not-found.html"));
  }

  entry.clicks++;
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

export default router;
