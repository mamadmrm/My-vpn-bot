require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN);

const db = new sqlite3.Database("./database.db");

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ================= DB =================

db.run(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0,
 first_start INTEGER DEFAULT 0
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

db.run(`
CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 config TEXT
)
`);

// ================= WEBHOOK =================

const WEBHOOK_URL =
`https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
 bot.processUpdate(req.body);
 res.sendStatus(200);
});

// ================= PAYMENTS =================

let payments = {};

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

  if (!user) {
   db.run(`INSERT INTO users(id, first_start) VALUES(?,1)`, [chatId]);

   bot.sendMessage(chatId, `👋 خوش آمدید به VPN Mirza`, {
    reply_markup: {
     inline_keyboard: [
      [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
      [{ text: "🎁 تست رایگان", callback_data: "free" }],
      [{ text: "📦 سرویس‌های من", callback_data: "my" }]
     ]
    }
   });

  } else {

   bot.sendMessage(chatId, "👋 خوش آمدید", {
    reply_markup: {
     inline_keyboard: [
      [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
      [{ text: "🎁 تست رایگان", callback_data: "free" }],
      [{ text: "📦 سرویس‌های من", callback_data: "my" }]
     ]
    }
   });

  }

 });

});

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 // ---------- BUY MENU ----------
 if (data === "buy") {

  return bot.sendMessage(chatId, "💰 پلن‌ها (تومان):", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 340,000 تومان", callback_data: "buy_2" }],
     [{ text: "5GB - 800,000 تومان", callback_data: "buy_5" }],
     [{ text: "10GB - 1,500,000 تومان", callback_data: "buy_10" }]
    ]
   }
  });

 }

 // ---------- BUY LOGIC ----------
 if (data.startsWith("buy_")) {

  let amount = 340000;
  let type = "2GB";

  if (data === "buy_5") {
   amount = 800000;
   type = "5GB";
  }

  if (data === "buy_10") {
   amount = 1500000;
   type = "10GB";
  }

  try {

   const orderId = `${chatId}_${Date.now()}`;

   payments[orderId] = { chatId, type };

   // ⚠️ Plisio: USD باید باشه، پس تبدیل تقریبی تومان به دلار
   const usd = Math.max(Math.round(amount / 60000), 1);

   // TON برای همه پلن‌ها (پایدارتر از BNB)
   const currency = "TON";

   const response = await axios.get(
    "https://api.plisio.net/api/v1/invoices/new",
    {
     params: {
      api_key: process.env.PLISIO_SECRET_KEY,
      order_number: orderId,
      order_name: type,

      source_currency: "USD",
      source_amount: usd,

      currency: currency,

      email: "test@test.com",

      callback_url: `https://${process.env.RAILWAY_STATIC_URL}/plisio`
     }
    }
   );

   if (!response.data || response.data.status !== "success") {
    console.log("PLISIO ERROR:", response.data);
    return bot.sendMessage(chatId, "❌ خطا در ساخت لینک پرداخت");
   }

   const payUrl = response.data.data.invoice_url;

   bot.sendMessage(chatId, `💳 پرداخت (${currency})`, {
    reply_markup: {
     inline_keyboard: [
      [{ text: "💰 پرداخت", url: payUrl }]
     ]
    }
   });

  } catch (e) {
   console.log(e.response?.data || e.message);
   bot.sendMessage(chatId, "❌ خطا در پرداخت");
  }

 }

 // ---------- FREE ----------
 if (data === "free") {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

   if (!user) return;

   if (user.free_used === 1)
    return bot.sendMessage(chatId, "❌ قبلاً تست گرفتی");

   db.get(
    `SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`,
    [],
    (err, row) => {

     if (!row)
      return bot.sendMessage(chatId, "❌ تست نداریم");

     db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
     db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

     db.run(
      `INSERT INTO services(user_id,config) VALUES(?,?)`,
      [chatId, row.config]
     );

     bot.sendMessage(chatId, `🎁 تست:\n\n${row.config}`);

    }
   );

  });

 }

 // ---------- MY ----------
 if (data === "my") {

  db.all(
   `SELECT * FROM services WHERE user_id=?`,
   [chatId],
   (err, rows) => {

    if (!rows.length)
     return bot.sendMessage(chatId, "❌ سرویسی نداری");

    rows.forEach(r => {
     bot.sendMessage(chatId, r.config);
    });

   }
  );

 }

});

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("Bot Running...");
});
