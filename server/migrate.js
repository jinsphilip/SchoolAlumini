// One-time (and re-runnable) seed: loads data/alumni.json (public fields)
// and, if present locally, data/alumni.private.js (adds email/facebook/
// birthday) and upserts everything into MongoDB. Safe to re-run - it
// upserts by `id`, so existing edits made through the live site are left
// alone for records not present in these files, and are overwritten by
// them for records that are (so don't re-run this after the batch has
// started editing their own rows, unless you mean to reset them).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { connect, collection } = require("./db");

function loadPublic() {
  const file = path.join(__dirname, "..", "data", "alumni.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadPrivate() {
  const file = path.join(__dirname, "..", "data", "alumni.private.js");
  if (!fs.existsSync(file)) { return null; }
  const src = fs.readFileSync(file, "utf8");
  const match = src.match(/window\.ALUMNI\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) { throw new Error("Could not parse data/alumni.private.js - unexpected format"); }
  return JSON.parse(match[1]);
}

async function main() {
  const publicRows = loadPublic();
  const privateRows = loadPrivate();

  const byId = new Map(publicRows.map(function (r) { return [r.id, r]; }));
  if (privateRows) {
    for (const row of privateRows) {
      byId.set(row.id, Object.assign({}, byId.get(row.id), row));
    }
  }
  const rows = Array.from(byId.values()).map(function (r) {
    return Object.assign({ email: "", facebook: "", birthday: "" }, r);
  });

  await connect();
  const col = collection();
  await col.createIndex({ id: 1 }, { unique: true });

  for (const row of rows) {
    await col.updateOne({ id: row.id }, { $set: row }, { upsert: true });
  }
  console.log("Migrated " + rows.length + " alumni records into MongoDB" + (privateRows ? " (with contact details)." : " (public fields only - no data/alumni.private.js found locally)."));
  process.exit(0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
