const fs = require("fs");

const DB_FILE = "database.json";

if (!fs.existsSync(DB_FILE)) {
 fs.writeFileSync(DB_FILE, JSON.stringify({
  users: [],
  configs: [],
  purchases: [],
  pendingPayments: []
 }, null, 2));
}

function read() {
 return JSON.parse(fs.readFileSync(DB_FILE));
}

function write(data) {
 fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = {

 createUser(id, username, firstName) {
  const db = read();

  const exists = db.users.find(u => u.id == id);

  if (!exists) {
   db.users.push({
    id,
    username,
    firstName,
    hasFreeTest: false
   });

   write(db);
  }
 },

 getUser(id) {
  const db = read();
  return db.users.find(u => u.id == id);
 },

 setFreeTestUsed(id) {
  const db = read();

  const user = db.users.find(u => u.id == id);

  if (user) {
   user.hasFreeTest = true;
   write(db);
  }
 },

 addConfig(type, config) {
  const db = read();

  db.configs.push({
   id: Date.now() + Math.random(),
   type,
   config,
   used: false
  });

  write(db);
 },

 getUnusedConfig(type) {
  const db = read();

  return db.configs.find(c =>
   c.type === type && !c.used
  );
 },

 useConfig(id) {
  const db = read();

  const cfg = db.configs.find(c => c.id == id);

  if (cfg) {
   cfg.used = true;
   write(db);
  }
 },

 addPurchase(userId, type, config) {
  const db = read();

  db.purchases.push({
   userId,
   type,
   config
  });

  write(db);
 },

 getPurchases(userId) {
  const db = read();

  return db.purchases.filter(p =>
   p.userId == userId
  );
 },

 setPendingPayment(userId, plan) {
  const db = read();

  db.pendingPayments = db.pendingPayments.filter(
   p => p.userId != userId
  );

  db.pendingPayments.push({
   userId,
   plan
  });

  write(db);
 },

 getPendingPayment(userId) {
  const db = read();

  return db.pendingPayments.find(
   p => p.userId == userId
  );
 },

 clearPendingPayment(userId) {
  const db = read();

  db.pendingPayments = db.pendingPayments.filter(
   p => p.userId != userId
  );

  write(db);
 }
};
