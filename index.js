require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");
const QRCode = require("qrcode");

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

// ================= WEBHOOK =================

const WEBHOOK_URL =
`https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
 bot.processUpdate(req.body);
 res.sendStatus(200);
});

// ================= UI =================

const menu = {
 keyboard: [
  ["🛒 خرید اشتراک", "🎁 تست رایگان"],
  ["📦 سرویس‌های من"]
 ],
 resize_keyboard: true
};

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

 bot.sendMessage(chatId, "👋 خوش آمدید", {
  reply_markup: menu
 });

});

// ================= TEXT HANDLER =================

bot.on("message", async (msg) => {

 const chatId = msg.chat.id;
 const text = msg.text;

 if (!text) return;

 // ---------- BUY ----------
 if (text === "🛒 خرید اشتراک") {

  return bot.sendMessage(chatId, "💰 پلن‌ها:", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 340,000", callback_data: "buy_2" }],
     [{ text: "5GB - 800,000", callback_data: "buy_5" }],
     [{ text: "10GB - 1,500,000", callback_data: "buy_10" }]
    ]
   }
  });

 }

 // ---------- FREE ----------
 if (text === "🎁 تست رایگان") {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

   if (!user) return;

   if (user.free_used === 1) {
    return bot.sendMessage(chatId, "❌ قبلاً تست گرفتی");
   }

   db.get(`SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`, [], (err, row) => {

    if (!row) return bot.sendMessage(chatId, "❌ تست نداریم");

    db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
    db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

    db.run(`INSERT INTO services(user_id,config) VALUES(?,?)`, [chatId, row.config]);

    sendConfig(chatId, row.config);

   });

  });

 }

 // ---------- MY ----------
 if (text === "📦 سرویس‌های من") {

  db.all(`SELECT * FROM services WHERE user_id=?`, [chatId], (err, rows) => {

   if (!rows.length)
    return bot.sendMessage(chatId, "❌ سرویسی نداری");

   rows.forEach(r => sendConfig(chatId, r.config));

  });

 }

});

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 if (!data.startsWith("buy_")) return;

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

  const response = await axios.get(
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

  const payUrl = response.data?.data?.invoice_url;

  if (!payUrl) {
   return bot.sendMessage(chatId, "❌ خطا در ساخت لینک پرداخت");
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

});

// ================= QR FUNCTION =================

async function sendConfig(chatId, config) {

 try {

  const qr = await QRCode.toBuffer(config);

  return bot.sendPhoto(chatId, qr, {
   caption: "📦 کانفیگ شما:\n\n" + config
  });

 } catch {

  return bot.sendMessage(chatId, "📦 کانفیگ:\n\n" + config);

 }

}

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("Bot Running...");
});
