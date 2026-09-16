require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { connect, collection } = require("./db");

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Contact fields (email, phone, facebook, birthday) are only ever sent to
// a request carrying the correct admin token - never to the public API.
// photo is the one contact-adjacent field that IS public, by design - the
// point of collecting it is for classmates to recognise each other.
const PUBLIC_FIELDS = { _id: 0, id: 1, name: 1, division: 1, batch: 1, whatsappGroup: 1, photo: 1, notes: 1, possibleDuplicate: 1 };
const FULL_FIELDS = { _id: 0 };

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const PHOTO_MAX_LENGTH = 350000; // ~250KB of image data - plenty for a small avatar

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
// Photos travel as base64 JSON, which runs ~1/3 larger than the raw image -
// everything else PATCHed is tiny text, so this limit is really just the
// photo-upload ceiling (enforced again, more precisely, below).
app.use(express.json({ limit: "600kb" }));

// A handful of edits per device per window is normal for one person
// fixing their own row; anything more is almost certainly abuse.
const editLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many edits from this device recently. Try again later." }
});

// Nobody visits this URL directly except out of curiosity (the frontend
// only ever calls /health and /api/*) - a friendly response here instead
// of Express's default "Cannot GET /" avoids that looking like a broken
// deploy when it's actually just an unused root path.
app.get("/", function (req, res) {
  res.json({
    ok: true,
    service: "schoolalumini-api",
    endpoints: ["/health", "/api/alumni", "/api/alumni/full?token=...", "PATCH /api/alumni/:id"]
  });
});

app.get("/health", function (req, res) {
  res.json({ ok: true });
});

app.get("/api/alumni", async function (req, res) {
  try {
    const rows = await collection().find({}, { projection: PUBLIC_FIELDS }).sort({ division: 1, name: 1 }).toArray();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/alumni/full", async function (req, res) {
  const token = req.query.token || req.get("x-admin-token");
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "Invalid admin token" });
  }
  try {
    const rows = await collection().find({}, { projection: FULL_FIELDS }).sort({ division: 1, name: 1 }).toArray();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/alumni/:id", editLimiter, async function (req, res) {
  const id = req.params.id;
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "whatsappGroup")) {
    const v = req.body.whatsappGroup;
    if (v !== true && v !== false && v !== null) {
      return res.status(400).json({ error: "whatsappGroup must be true, false, or null" });
    }
    updates.whatsappGroup = v;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
    const v = String(req.body.email || "").trim();
    if (v && !EMAIL_RE.test(v)) { return res.status(400).json({ error: "Invalid email address" }); }
    updates.email = v;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
    updates.phone = String(req.body.phone || "").trim().slice(0, 30);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "facebook")) {
    updates.facebook = String(req.body.facebook || "").trim().slice(0, 200);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "birthday")) {
    const v = String(req.body.birthday || "").trim();
    if (v && !DATE_RE.test(v)) { return res.status(400).json({ error: "Birthday must be YYYY-MM-DD" }); }
    updates.birthday = v;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "photo")) {
    const v = String(req.body.photo || "").trim();
    if (v) {
      if (v.length > PHOTO_MAX_LENGTH) { return res.status(400).json({ error: "Photo is too large - please use a smaller image" }); }
      if (!PHOTO_RE.test(v)) { return res.status(400).json({ error: "Photo must be a JPEG, PNG, or WebP image" }); }
    }
    updates.photo = v;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No editable fields provided" });
  }
  updates.updatedAt = new Date().toISOString();

  try {
    const result = await collection().findOneAndUpdate(
      { id: id },
      { $set: updates },
      { returnDocument: "after", projection: PUBLIC_FIELDS, includeResultMetadata: true }
    );
    if (!result.value) { return res.status(404).json({ error: "No alumni record with that id" }); }
    res.json(result.value);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

connect()
  .then(function () {
    app.listen(PORT, function () {
      console.log("API listening on :" + PORT);
    });
  })
  .catch(function (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
