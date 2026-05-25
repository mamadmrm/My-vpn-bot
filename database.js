const Database = require("better-sqlite3");

const db = new Database("database.db");

// ================= TABLES =================

// USERS
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 username TEXT,
 first_name TEXT,
 balance INTEGER DEFAULT 0,
 free_used INTEGER DEFAULT 0
)
`).run();

// CONFIGS
db.prepare(`
CREATE TABLE IF NOT EXISTS configs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT,
 config TEXT,
 used INTEGER DEFAULT 0
)
`).run();

// PURCHASES
db.prepare(`
CREATE TABLE IF NOT EXISTS purchases (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 type TEXT,
 config TEXT
)
`).run();

// ================= FUNCTIONS =================

module.exports = {

 // ---------- USERS ----------

 createUser(id, username, first_name) {

  db.prepare(`
   INSERT OR IGNORE INTO users
   (id, username, first_name)
   VALUES (?, ?, ?)
  `).run(id, username, first_name);

 },

 getUser(id) {

  return db.prepare(`
   SELECT * FROM users
   WHERE id=?
  `).get(id);

 },

 addBalance(id, amount) {

  db.prepare(`
   UPDATE users
   SET balance = balance + ?
   WHERE id=?
  `).run(amount, id);

 },

 getBalance(id) {

  const user = db.prepare(`
   SELECT balance FROM users
   WHERE id=?
  `).get(id);

  return user?.balance || 0;

 },

 setFreeUsed(id) {

  db.prepare(`
   UPDATE users
   SET free_used=1
   WHERE id=?
  `).run(id);

 },

 // ---------- CONFIGS ----------

 addConfig(type, config) {

  db.prepare(`
   INSERT INTO configs(type, config)
   VALUES (?, ?)
  `).run(type, config);

 },

 getConfig(type) {

  return db.prepare(`
   SELECT * FROM configs
   WHERE type=? AND used=0
   LIMIT 1
  `).get(type);

 },

 useConfig(id) {

  db.prepare(`
   UPDATE configs
   SET used=1
   WHERE id=?
  `).run(id);

 },

 // ---------- PURCHASES ----------

 addPurchase(user_id, type, config) {

  db.prepare(`
   INSERT INTO purchases
   (user_id, type, config)
   VALUES (?, ?, ?)
  `).run(user_id, type, config);

 },

 getPurchases(user_id) {

  return db.prepare(`
   SELECT * FROM purchases
   WHERE user_id=?
  `).all(user_id);

 },

 // ---------- BROADCAST ----------

 getAllUsers() {

  return db.prepare(`
   SELECT id FROM users
  `).all();

 }

};
