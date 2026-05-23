require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const db = new sqlite3.Database('./database.db');

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ---------------- DATABASE ----------------

db.run(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 config TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS configs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT,
 config TEXT,
 used INTEGER DEFAULT 0
)
`);

// ---------------- START ----------------

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

 bot.sendMessage(chatId,
  "🌐 به ربات VPN خوش اومدی",
  {
   reply_markup: {
    inline_keyboard: [
     [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
     [{ text: "🎁 تست رایگان", callback_data: "free" }],
     [{ text: "📦 سرویس‌های من", callback_data: "my" }]
    ]
   }
  }
 );

});

// ---------------- CALLBACKS ----------------

bot.on('callback_query', async (query) => {

 const chatId = query.message.chat.id;
 const data = query.data;

 // BUY MENU
 if (data === 'buy') {
  return bot.sendMessage(chatId, "پلن انتخاب کن:", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 2$", callback_data: "buy_2" }],
     [{ text: "5GB - 4$", callback_data: "buy_5" }],
     [{ text: "10GB - 9$", callback_data: "buy_10" }]
    ]
   }
  });
 }

 // BUY PROCESS
 if (data.startsWith('buy_')) {

  let amount = 0;
  let type = '';

  if (data === 'buy_2') { amount = 2; type = '2GB'; }
  if (data === 'buy_5') { amount = 4; type = '5GB'; }
  if (data === 'buy_10') { amount = 9; type = '10GB'; }

  try {

   const res = await axios.post(
    "https://api.plisio.net/api/v1/invoices/new",
    new URLSearchParams({
     source_currency: "USD",
     source_amount: amount.toString(),
     order_number: `${chatId}_${Date.now()}`,
     currency: "USDT",
     email: "test@test.com",
     callback_url: `${process.env.BASE_URL}/webhook`,
     api_key: process.env.PLISIO_SECRET_KEY
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
   );

   const payUrl = res.data.data.invoice_url;

   global[chatId] = { type };

   bot.sendMessage(chatId, "💳 پرداخت رو انجام بده:", {
    reply_markup: {
     inline_keyboard: [
      [{ text: "💰 پرداخت", url: payUrl }]
     ]
    }
   });

  } catch (e) {
   console.log(e.response?.data || e.message);
   bot.sendMessage(chatId, "❌ خطا در ساخت پرداخت");
  }

 }

 // FREE TEST
 if (data === 'free') {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

   if (user.free_used === 1) {
    return bot.sendMessage(chatId, "❌ قبلاً تست گرفتی");
   }

   db.get(`SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`, [], (err, row) => {

    if (!row) return bot.sendMessage(chatId, "❌ تست موجود نیست");

    db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);
    db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);

    db.run(`INSERT INTO services(user_id, config) VALUES(?,?)`, [chatId, row.config]);

    bot.sendMessage(chatId, `🎁 تست رایگان:\n\n${row.config}`);

   });

  });

 }

 // MY SERVICES
 if (data === 'my') {

  db.all(`SELECT * FROM services WHERE user_id=?`, [chatId], (err, rows) => {

   if (!rows.length) return bot.sendMessage
