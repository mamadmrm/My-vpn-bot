const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { users: {}, payments: {}, configs: {} };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUser(userId) {
  const db = loadDB();
  return db.users[userId] || null;
}

function createUser(userId, username, firstName) {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      username: username || '',
      firstName: firstName || '',
      createdAt: new Date().toISOString(),
      hasFreeTest: false,
      purchases: []
    };
    saveDB(db);
  }
  return db.users[userId];
}

function addPurchase(userId, planId, config, expireDate) {
  const db = loadDB();
  if (db.users[userId]) {
    db.users[userId].purchases.push({
      planId,
      config,
      purchaseDate: new Date().toISOString(),
      expireDate
    });
    saveDB(db);
  }
}

function setFreeTestUsed(userId) {
  const db = loadDB();
  if (db.users[userId]) {
    db.users[userId].hasFreeTest = true;
    saveDB(db);
  }
}

function getAllUsers() {
  const db = loadDB();
  return Object.values(db.users);
}

function updateConfig(key, value) {
  const db = loadDB();
  db.configs[key] = value;
  saveDB(db);
}

function getConfig(key) {
  const db = loadDB();
  return db.configs[key] || null;
}

module.exports = {
  loadDB,
  saveDB,
  getUser,
  createUser,
  addPurchase,
  setFreeTestUsed,
  getAllUsers,
  updateConfig,
  getConfig
};
