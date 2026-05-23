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

db.run(`
CREATE TABLE IF NOT EXISTS payments (
 chat_id INTEGER PRIMARY KEY,
 order_id TEXT,
 pay_url TEXT,
 type TEXT,
 created_at INTEGER
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS sales (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 type TEXT,
 amount INTEGER,
 time INTEGER
)
`);

// ================= WEBHOOK =================

const WEBHOOK_URL =
`https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
 try {
  bot.processUpdate(req.body);
 } catch (e) {
  console.log("Webhook error:", e.message);
 }
 res.sendStatus(200);
});

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

 bot.sendMessage(chatId,
`👋 سلام و درود به ربات VPN Mirza

🔸 سرویس‌ها پایدار و سریع هستند
🔸 تست رایگان فقط یک بار
🔸 پشتیبانی فعال`
 , {
  reply_markup: {
   inline_keyboard: [
    [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
    [{ text: "🎁 تست رایگان", callback_data: "free" }],
    [{ text: "📦 سرویس‌های من", callback_data: "my" }]
   ]
  }
 });

});

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 // ---------- BUY ----------
 if (data === "buy") {

  return bot.sendMessage(chatId, "💰 پلن‌ها:", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 340,000 تومان", callback_data: "buy_2" }],
     [{ text: "5GB - 800,000 تومان", callback_data: "buy_5" }],
     [{ text: "10GB - 1,500,000 تومان", callback_data: "buy_10" }]
    ]
   }
  });

 }

 // ---------- PAYMENT ----------
 if (data.startsWith("buy_")) {

  const plans = {
   buy_2: { type: "2GB", amount: 340000 },
   buy_5: { type: "5GB", amount: 800000 },
   buy_10: { type: "10GB", amount: 1500000 }
  };

  const plan = plans[data];
  if (!plan) return;

  try {

   const orderId = `${chatId}_${Date.now()}`;
   const usd = Math.max(Math.round(plan.amount / 60000), 1);

   const res = await axios.get(
    "https://api.plisio.net/api/v1/invoices/new",
    {
     params: {
      api_key: process.env.PLISIO_SECRET_KEY,
      order_number: orderId,
      order_name: plan.type,
      source_currency: "USD",
      source_amount: usd,
      currency: "TON",
      email: "test@test.com",
      callback_url: `https://${process.env.RAILWAY_STATIC_URL}/plisio`
     }
    }
   );

   const payUrl = res.data?.data?.invoice_url;

   if (!payUrl) {
    return bot.sendMessage(chatId, "❌ خطا در ساخت پرداخت");
   }

   bot.sendMessage(chatId, "💳 لینک پرداخت:", {
    reply_markup: {
     inline_keyboard: [
      [{ text: "💰 پرداخت", url: payUrl }]
     ]
    }
   });

  } catch (e) {
   console.log(e.message);
   bot.sendMessage(chatId, "❌ خطا در پرداخت");
  }

 }

 // ---------- 🎁 FREE FIX ----------
 if (data === "free") {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

   if (!user) {
    db.run(`INSERT INTO users(id,free_used) VALUES(?,0)`, [chatId]);
    user = { free_used: 0 };
   }

   if (user.free_used === 1) {
    return bot.sendMessage(chatId, "❌ شما قبلاً تست رایگان گرفته‌اید");
   }

   db.get(
    `SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`,
    [],
    (err, row) => {

     if (!row) {
      return bot.sendMessage(chatId, "❌ تست رایگان موجود نیست");
     }

     db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
     db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

     db.run(`INSERT INTO services(user_id,config) VALUES(?,?)`, [
      chatId,
      row.config
     ]);

     bot.sendMessage(chatId, "🎁 تست شما:\n\n" + row.config);

    }
   );

  });

 }

 // ---------- 📦 MY SERVICES FIX ----------
 if (data === "my") {

  db.all(
   `SELECT * FROM services WHERE user_id=?`,
   [chatId],
   (err, rows) => {

    if (err || !rows || rows.length === 0) {
     return bot.sendMessage(chatId, "📭 شما هیچ سرویسی ندارید");
    }

    let text = "📦 سرویس‌های شما:\n\n";

    rows.forEach((r, i) => {
     text += `🔹 سرویس ${i + 1}:\n${r.config}\n\n`;
    });

    bot.sendMessage(chatId, text);
   }
  );

 }

});

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("BOT RUNNING");
});
