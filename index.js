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
 type TEXT
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

 db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {

  if (!user) {
   db.run(`INSERT INTO users(id) VALUES(?)`, [chatId]);
  }

  bot.sendMessage(chatId, "👋 خوش آمدید", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
     [{ text: "🎁 تست رایگان", callback_data: "free" }],
     [{ text: "📦 سرویس‌های من", callback_data: "my" }]
    ]
   }
  });

 });

});

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 // ---------- BUY MENU ----------
 if (data === "buy") {

  return bot.sendMessage(chatId, "💰 پلن‌ها:", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "2GB - 340k", callback_data: "buy_2" }],
     [{ text: "5GB - 800k", callback_data: "buy_5" }],
     [{ text: "10GB - 1.5M", callback_data: "buy_10" }]
    ]
   }
  });

 }

 // ---------- CHECK EXISTING PAYMENT ----------
 if (data.startsWith("buy_")) {

  const typeMap = {
   buy_2: { type: "2GB", amount: 340000 },
   buy_5: { type: "5GB", amount: 800000 },
   buy_10: { type: "10GB", amount: 1500000 }
  };

  const plan = typeMap[data];

  db.get(
   `SELECT * FROM payments WHERE chat_id=?`,
   [chatId],
   async (err, row) => {

    // اگر لینک قبلی وجود دارد
    if (row) {

     return bot.sendMessage(chatId,
      "⚠️ شما یک لینک پرداخت فعال دارید",
      {
       reply_markup: {
        inline_keyboard: [
         [{ text: "💳 ادامه پرداخت", url: row.pay_url }],
         [{ text: "❌ لغو و ساخت جدید", callback_data: `renew_${data}` }]
        ]
       }
      });

    }

    await createPayment(chatId, plan);

   }
  );

 }

 // ---------- RENEW PAYMENT ----------
 if (data.startsWith("renew_")) {

  const planKey = data.replace("renew_", "");

  const typeMap = {
   buy_2: { type: "2GB", amount: 340000 },
   buy_5: { type: "5GB", amount: 800000 },
   buy_10: { type: "10GB", amount: 1500000 }
  };

  const plan = typeMap[planKey];

  db.run(`DELETE FROM payments WHERE chat_id=?`, [chatId]);

  await createPayment(chatId, plan);

 }

});

// ================= PAYMENT FUNCTION =================

async function createPayment(chatId, plan) {

 const orderId = `${chatId}_${Date.now()}`;

 const usd = Math.max(Math.round(plan.amount / 60000), 1);

 const crypto = "TON";

 try {

  const response = await axios.get(
   "https://api.plisio.net/api/v1/invoices/new",
   {
    params: {
     api_key: process.env.PLISIO_SECRET_KEY,
     order_number: orderId,
     order_name: plan.type,

     source_currency: "USD",
     source_amount: usd,

     currency: crypto,

     email: "test@test.com",

     callback_url:
      `https://${process.env.RAILWAY_STATIC_URL}/plisio`
    }
   }
  );

  const payUrl = response.data.data.invoice_url;

  db.run(
   `INSERT OR REPLACE INTO payments(chat_id,order_id,pay_url,type)
    VALUES(?,?,?,?)`,
   [chatId, orderId, payUrl, plan.type]
  );

  bot.sendMessage(chatId, "💳 پرداخت:", {
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

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("Bot Running...");
});
