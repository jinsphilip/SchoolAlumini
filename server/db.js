const { MongoClient } = require("mongodb");

let client;
let db;

async function connect() {
  if (db) { return db; }
  const uri = process.env.MONGODB_URI;
  if (!uri) { throw new Error("MONGODB_URI is not set"); }
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || "school_alumni");
  return db;
}

function collection() {
  if (!db) { throw new Error("Database not connected yet - call connect() first"); }
  return db.collection("alumni");
}

module.exports = { connect, collection };
