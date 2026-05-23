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

// ================= DATABASE =================

db.run(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0
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

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

 bot.sendMessage(chatId, "🌐 VPN Bot", {
  reply_markup: {
   inline_keyboard: [
    [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
    [{ text: "🎁 تست رایگان", callback_data: "free" }],
    [{ text: "📦 سرویس‌های من", callback_data: "my" }],

    ...(chatId === ADMIN_ID
      ? [[{ text: "⚙️ پنل مدیریت", callback_data: "admin" }]]
      : [])
   ]
  }
 });

});

// ================= PAYMENTS MEMORY =================

let payments = {};

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 // ---------- BUY MENU ----------

 if (data === "buy") {

  return bot.sendMessage(chatId, "پلن‌ها:", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 2$", callback_data: "buy_2GB" }],
     [{ text: "5GB - 4$", callback_data: "buy_5GB" }],
     [{ text: "10GB - 9$", callback_data: "buy_10GB" }]
    ]
   }
  });

 }

 // ---------- BUY PROCESS ----------

 if (data.startsWith("buy_")) {

  let amount = 2;
  let type = "2GB";

  if (data === "buy_5GB") {
   amount = 4;
   type = "5GB";
  }

  if (data === "buy_10GB") {
   amount = 9;
   type = "10GB";
  }

  try {

   const orderId = `${chatId}_${Date.now()}`;

   payments[orderId] = { chatId, type };

   // 🔥 انتخاب شبکه: TON یا BNB
   const crypto = amount >= 5 ? "BNB" : "TON";

   const response = await axios.get(
    "https://api.plisio.net/api/v1/invoices/new",
    {
     params: {
      api_key: process.env.PLISIO_SECRET_KEY,
      order_number: orderId,
      order_name: type,

      source_currency: "USD",
      source_amount: Math.max(amount, 1),

      currency: crypto,

      email: "test@test.com",

      callback_url: `https://${process.env.RAILWAY_STATIC_URL}/plisio`
     }
    }
   );

   if (!response.data || response.data.status !== "success") {
    console.log(response.data);
    return bot.sendMessage(chatId, "❌ خطا در ساخت پرداخت");
   }

   const payUrl = response.data.data.invoice_url;

   bot.sendMessage(chatId, "💳 پرداخت:", {
    reply_markup: {
     inline_keyboard: [
      [{ text: `💰 پرداخت با ${crypto}`, url: payUrl }]
     ]
    }
   });

  } catch (e) {
   console.log(e.response?.data || e.message);
   bot.sendMessage(chatId, "❌ خطا در پرداخت");
  }

 }

 // ---------- FREE TEST ----------

 if (data === "free") {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

   if (!user) return;

   if (user.free_used === 1) {
    return bot.sendMessage(chatId, "❌ قبلاً تست گرفتی");
   }

   db.get(
    `SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`,
    [],
    (err, row) => {

     if (!row) return bot.sendMessage(chatId, "❌ تست نداریم");

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

 // ---------- MY SERVICES ----------

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

 // ---------- ADMIN PANEL ----------

 if (data === "admin" && chatId === ADMIN_ID) {

  return bot.sendMessage(chatId, "⚙️ پنل مدیریت", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "➕ 2GB", callback_data: "add_2GB" }],
     [{ text: "➕ 5GB", callback_data: "add_5GB" }],
     [{ text: "➕ 10GB", callback_data: "add_10GB" }],
     [{ text: "➕ FREE", callback_data: "add_FREE" }]
    ]
   }
  });

 }

 // ---------- ADD CONFIG ----------

 if (chatId === ADMIN_ID && data.startsWith("add_")) {

  waitingType = data.replace("add_", "");
  waitingAdmin = true;

  return bot.sendMessage(chatId, `📥 کانفیگ ${waitingType} رو بفرست`);

 }

});

// ================= ADMIN MESSAGE =================

let waitingAdmin = false;
let waitingType = "";

bot.on("message", (msg) => {

 if (msg.chat.id !== ADMIN_ID) return;
 if (!waitingAdmin) return;

 if (msg.text && msg.text.startsWith("vless://")) {

  db.run(
   `INSERT INTO configs(type,config) VALUES(?,?)`,
   [waitingType, msg.text]
  );

  waitingAdmin = false;

  bot.sendMessage(ADMIN_ID, "✅ ذخیره شد");

 }

});

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("Bot Running...");
});
