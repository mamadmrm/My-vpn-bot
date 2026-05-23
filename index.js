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

// ================= CLEAN EXPIRED PAYMENTS (30 MIN) =================

setInterval(() => {
 const expire = Date.now() - 30 * 60 * 1000;
 db.run(`DELETE FROM payments WHERE created_at < ?`, [expire]);
}, 60 * 1000);

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.get(`SELECT * FROM users WHERE id=?`, [chatId], () => {

  db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

  bot.sendMessage(chatId,
`👋 سلام و درود به ربات VPN Mirza

🔸 زمان سرویس ها نامحدود هست  
🔹 سرویس ها پایدار و سریع هستند  
🔸 بازگشت وجه در شرایط خاص انجام می‌شود`
  , {
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

 // ---------- BUY ----------
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
     "⚠️ شما یک پرداخت فعال دارید",
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

 // ---------- ADMIN PANEL ----------
 if (data === "admin" && chatId === ADMIN_ID) {

  return bot.sendMessage(chatId, "⚙️ پنل مدیریت", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "➕ افزودن 2GB", callback_data: "add_2GB" }],
     [{ text: "➕ افزودن 5GB", callback_data: "add_5GB" }],
     [{ text: "➕ افزودن 10GB", callback_data: "add_10GB" }],
     [{ text: "➕ افزودن FREE", callback_data: "add_FREE" }]
    ]
   }
  });

 }

 // ---------- ADMIN ADD ----------
 if (chatId === ADMIN_ID && data.startsWith("add_")) {

  waitingType = data.replace("add_", "");
  waitingAdmin = true;

  return bot.sendMessage(chatId, `📥 کانفیگ ${waitingType} رو ارسال کن`);
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

  bot.sendMessage(ADMIN_ID, "✅ کانفیگ ذخیره شد");

 }

});

// ================= PAYMENT =================

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
   `INSERT OR REPLACE INTO payments(chat_id,order_id,pay_url,type,created_at)
    VALUES(?,?,?,?,?)`,
   [chatId, orderId, payUrl, plan.type, Date.now()]
  );

  bot.sendMessage(chatId,
   "💳 لینک پرداخت (۳۰ دقیقه اعتبار دارد)", {
   reply_markup: {
    inline_keyboard: [
     [{ text: "💰 پرداخت", url: payUrl }]
    ]
   }
  });

  // delete after 30 min
  setTimeout(() => {
   db.run(`DELETE FROM payments WHERE chat_id=?`, [chatId]);
  }, 30 * 60 * 1000);

 } catch (e) {
  console.log(e.response?.data || e.message);
  bot.sendMessage(chatId, "❌ خطا در پرداخت");
 }

}

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
 console.log("Bot Running...");
});
