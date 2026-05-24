const fs = require('fs');
const path = require('path');

const DB_FILE = './database.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: {}, configs: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function createUser(userId, username, firstName) {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      username: username,
      firstName: firstName,
      purchases: [],
      hasFreeTest: false,
      createdAt: new Date().toISOString()
    };
    saveDB(db);
  }
  return db.users[userId];
}

function getUser(userId) {
  const db = loadDB();
  return db.users[userId];
}

function getAllUsers() {
  const db = loadDB();
  return Object.values(db.users);
}

function addPurchase(userId, planId, config, expireDate) {
  const db = loadDB();
  if (db.users[userId]) {
    db.users[userId].purchases.push({
      planId: planId,
      config: config,
      expireDate: expireDate,
      purchaseDate: new Date().toISOString()
    });
    saveDB(db);
  }
}

function updateConfig(planId, config) {
  const db = loadDB();
  db.configs[planId] = config;
  saveDB(db);
}

function getConfig(planId) {
  const db = loadDB();
  return db.configs[planId];
}

function setFreeTestUsed(userId) {
  const db = loadDB();
  if (db.users[userId]) {
    db.users[userId].hasFreeTest = true;
    saveDB(db);
  }
}

module.exports = {
  createUser,
  getUser,
  getAllUsers,
  addPurchase,
  updateConfig,
  getConfig,
  setFreeTestUsed
};
