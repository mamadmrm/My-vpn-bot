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
 bot.processUpdate(req.body);
 res.sendStatus(200);
});

// ================= CLEAN OLD PAYMENTS =================

setInterval(() => {

 const expireTime = Date.now() - 10 * 60 * 1000;

 db.run(`DELETE FROM payments WHERE created_at < ?`, [expireTime]);

}, 60 * 1000);

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.get(`SELECT * FROM users WHERE id=?`, [chatId], () => {

  db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

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

 // ---------- BUY ----------
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

 // ---------- BUY CHECK ----------
 if (data.startsWith("buy_")) {

  const plans = {
   buy_2: { type: "2GB", amount: 340000 },
   buy_5: { type: "5GB", amount: 800000 },
   buy_10: { type: "10GB", amount: 1500000 }
  };

  const plan = plans[data];

  db.get(`SELECT * FROM payments WHERE chat_id=?`, [chatId], async (err, row) => {

   if (row) {
    return bot.sendMessage(chatId,
     "⚠️ پرداخت فعال دارید",
     {
      reply_markup: {
       inline_keyboard: [
        [{ text: "💳 ادامه پرداخت", url: row.pay_url }],
        [{ text: "❌ ساخت جدید", callback_data: `renew_${data}` }]
       ]
      }
     });
   }

   await createPayment(chatId, plan);

  });

 }

 // ---------- RENEW ----------
 if (data.startsWith("renew_")) {

  const plans = {
   renew_buy_2: { type: "2GB", amount: 340000 },
   renew_buy_5: { type: "5GB", amount: 800000 },
   renew_buy_10: { type: "10GB", amount: 1500000 }
  };

  db.run(`DELETE FROM payments WHERE chat_id=?`, [chatId]);

  await createPayment(chatId, plans[data]);

 }

});

// ================= CREATE PAYMENT =================

async function createPayment(chatId, plan) {

 const orderId = `${chatId}_${Date.now()}`;
 const usd = Math.max(Math.round(plan.amount / 60000), 1);

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
     currency: "TON",
     email: "test@test.com",
     callback_url: `https://${process.env.RAILWAY_STATIC_URL}/plisio`
    }
   }
  );

  const payUrl = response.data.data.invoice_url;

  db.run(
   `INSERT INTO payments(chat_id,order_id,pay_url,type,created_at)
    VALUES(?,?,?,?,?)`,
   [chatId, orderId, payUrl, plan.type, Date.now()]
  );

  bot.sendMessage(chatId, "💳 پرداخت ایجاد شد (10 دقیقه اعتبار دارد)", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "💰 پرداخت", url: payUrl }]
    ]
   }
  });

  // auto delete message after 10 min
  setTimeout(() => {
   bot.sendMessage(chatId, "⏳ لینک پرداخت منقضی شد، دوباره بسازید");
   db.run(`DELETE FROM payments WHERE chat_id=?`, [chatId]);
  }, 10 * 60 * 1000);

 } catch (e) {
  console.log(e.response?.data || e.message);
  bot.sendMessage(chatId, "❌ خطا در پرداخت");
 }

}

// ================= CALLBACK VERIFY =================

app.post("/plisio", (req, res) => {

 const data = req.body;

 if (data.status === "completed") {

  db.get(`SELECT * FROM payments WHERE order_id=?`, [data.order_number], (err, pay) => {

   if (!pay) return;

   db.run(`INSERT INTO services(user_id,config) VALUES(?,?)`, [
    pay.chat_id,
    `🎉 سرویس فعال شد - پلن ${pay.type}`
   ]);

   db.run(`INSERT INTO sales(user_id,type,amount,time) VALUES(?,?,?,?)`, [
    pay.chat_id,
    pay.type,
    1,
    Date.now()
   ]);

   bot.sendMessage(pay.chat_id, "✅ پرداخت موفق - سرویس فعال شد");

   db.run(`DELETE FROM payments WHERE order_id=?`, [data.order_number]);

  });

 }

 res.sendStatus(200);

});

// ================= ADMIN PANEL =================

bot.on("callback_query", (q) => {

 const chatId = q.message.chat.id;

 if (q.data === "admin" && chatId === ADMIN_ID) {

  db.all(`SELECT * FROM sales`, [], (err, rows) => {

   const total = rows.length;

   bot.sendMessage(chatId,
`📊 پنل ادمین

💰 فروش کل: ${total}
👤 کاربران فعال: -
📦 سرویس‌ها: -`
   );

  });

 }

});

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("Bot Running...");
});
