require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const app = express();
app.use(express.json());

// ⚠️ مهم: polling خام + ساده
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const db = new sqlite3.Database("./database.db");

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ---------------- DB ----------------

db.run(`CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 config TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS configs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT,
 config TEXT,
 used INTEGER DEFAULT 0
)`);

// ---------------- START ----------------

bot.onText(/\/start/, (msg) => {
 const chatId = msg.chat.id;

 db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

 bot.sendMessage(chatId, "👋 خوش اومدی", {
  reply_markup: {
   inline_keyboard: [
    [{ text: "🛒 خرید", callback_data: "buy" }],
    [{ text: "🎁 تست رایگان", callback_data: "free" }],
    [{ text: "📦 سرویس‌های من", callback_data: "my" }]
   ]
  }
 });
});

// ---------------- CALLBACK ----------------

bot.on("callback_query", (q) => {
 const chatId = q.message.chat.id;
 const data = q.data;

 // BUY MENU
 if (data === "buy") {
  return bot.sendMessage(chatId, "پلن:", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 2$", callback_data: "buy_2" }],
     [{ text: "5GB - 4$", callback_data: "buy_5" }],
     [{ text: "10GB - 9$", callback_data: "buy_10" }]
    ]
   }
  });
 }

 // SIMPLE BUY (بدون پلاسیو برای تست پایداری)
 if (data.startsWith("buy_")) {
  let type = "2GB";

  if (data === "buy_5") type = "5GB";
  if (data === "buy_10") type = "10GB";

  db.get(
   `SELECT * FROM configs WHERE type=? AND used=0 LIMIT 1`,
   [type],
   (err, row) => {
    if (!row) return bot.sendMessage(chatId, "❌ کانفیگ نداریم");

    db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

    db.run(
     `INSERT INTO services(user_id, config) VALUES(?,?)`,
     [chatId, row.config]
    );

    bot.sendMessage(chatId, "✅ خرید انجام شد:\n\n" + row.config);
   }
  );
 }

 // FREE
 if (data === "free") {
  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {
   if (!user) return;

   if (user.free_used === 1)
    return bot.sendMessage(chatId, "❌ قبلاً گرفتی");

   db.get(
    `SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`,
    [],
    (err, row) => {
     if (!row) return bot.sendMessage(chatId, "❌ تست نداریم");

     db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
     db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

     bot.sendMessage(chatId, "🎁 تست:\n\n" + row.config);
    }
   );
  });
 }

 // MY
 if (data === "my") {
  db.all(
   `SELECT * FROM services WHERE user_id=?`,
   [chatId],
   (err, rows) => {
    if (!rows.length) return bot.sendMessage(chatId, "❌ سرویس نداری");

    rows.forEach((r) => {
     bot.sendMessage(chatId, r.config);
    });
   }
  );
 }
});

// ---------------- ADMIN ----------------

let waiting = false;
let type = "";

bot.onText(/\/admin/, (msg) => {
 if (msg.chat.id !== ADMIN_ID) return;

 bot.sendMessage(ADMIN_ID, "پنل:", {
  reply_markup: {
   inline_keyboard: [
    [{ text: "2GB", callback_data: "add_2GB" }],
    [{ text: "5GB", callback_data: "add_5GB" }],
    [{ text: "10GB", callback_data: "add_10GB" }],
    [{ text: "FREE", callback_data: "add_FREE" }]
   ]
  }
 });
});

bot.on("callback_query", (q) => {
 if (q.message.chat.id !== ADMIN_ID) return;

 if (q.data.startsWith("add_")) {
  type = q.data.replace("add_", "");
  waiting = true;
  bot.sendMessage(ADMIN_ID, "vless بفرست");
 }
});

bot.on("message", (msg) => {
 if (msg.chat.id !== ADMIN_ID) return;
 if (!waiting) return;

 if (msg.text && msg.text.startsWith("vless://")) {
  db.run(
   `INSERT INTO configs(type, config) VALUES(?,?)`,
   [type, msg.text]
  );

  waiting = false;
  bot.sendMessage(ADMIN_ID, "✅ ذخیره شد");
 }
});

console.log("Bot Running...");
