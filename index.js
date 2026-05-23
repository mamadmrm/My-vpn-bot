require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

const db = new sqlite3.Database("./database.db");

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ================= DATABASE =================

db.serialize(() => {

 db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  free_used INTEGER DEFAULT 0
 )`);

 db.run(`CREATE TABLE IF NOT EXISTS configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  config TEXT,
  used INTEGER DEFAULT 0
 )`);

 db.run(`CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  config TEXT,
  type TEXT
 )`);

 db.run(`CREATE TABLE IF NOT EXISTS payments (
  user_id INTEGER PRIMARY KEY,
  plan TEXT,
  pay_url TEXT,
  created_at INTEGER
 )`);

});

// ================= WEBHOOK =================

const WEBHOOK =
`https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

bot.setWebHook(WEBHOOK);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
 try {
  bot.processUpdate(req.body);
 } catch (e) {
  console.log(e.message);
 }
 res.sendStatus(200);
});

// ================= MENU =================

function menu(chatId) {
 return {
  reply_markup: {
   keyboard: [
    ["🛒 خرید اشتراک"],
    ["🎁 تست رایگان", "📦 سرویس های من"],
    ...(chatId === ADMIN_ID ? [["⚙️ مدیریت"]] : [])
   ],
   resize_keyboard: true
  }
 };
}

// ================= START =================

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

 bot.sendMessage(chatId,
`👋 خوش آمدید

🔹 سرویس ها فعال و پایدار
🔹 تحویل فوری بعد پرداخت`
 , menu(chatId));

});

// ================= STATE =================

let adminMode = false;
let adminType = "";

// ================= MESSAGES =================

bot.on("message", async (msg) => {

 const chatId = msg.chat.id;
 const text = msg.text;

 if (!text) return;

 // ---------- BUY ----------
 if (text === "🛒 خرید اشتراک") {

  return bot.sendMessage(chatId,
   "پلن ها:",
   {
    reply_markup: {
     inline_keyboard: [
      [{ text: "2GB - 340K", callback_data: "buy_2" }],
      [{ text: "5GB - 800K", callback_data: "buy_5" }],
      [{ text: "10GB - 1.5M", callback_data: "buy_10" }]
     ]
    }
   }
  );

 }

 // ---------- FREE ----------
 if (text === "🎁 تست رایگان") {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (e, u) => {

   if (u.free_used === 1)
    return bot.sendMessage(chatId, "❌ قبلاً گرفتی");

   db.get(`SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`, [], (e, c) => {

    if (!c)
     return bot.sendMessage(chatId, "❌ موجود نیست");

    db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
    db.run(`UPDATE configs SET used=1 WHERE id=?`, [c.id]);

    db.run(`INSERT INTO services(user_id,type,config) VALUES(?,?,?)`,
     [chatId, "20MB", c.config]);

    bot.sendMessage(chatId, "🎁 تست:\n\n" + c.config);

   });

  });

 }

 // ---------- MY ----------
 if (text === "📦 سرویس های من") {

  db.all(`SELECT * FROM services WHERE user_id=?`, [chatId], (e, rows) => {

   if (!rows.length)
    return bot.sendMessage(chatId, "خالیه");

   let t = "سرویس ها:\n\n";

   rows.forEach(r => {
    t += `🔹 ${r.type}\n${r.config}\n\n`;
   });

   bot.sendMessage(chatId, t);

  });

 }

 // ---------- ADMIN ----------
 if (text === "⚙️ مدیریت" && chatId === ADMIN_ID) {

  return bot.sendMessage(chatId,
`پنل:

add 2GB
add 5GB
add 10GB
add FREE`
  );

 }

 // ---------- ADD ----------
 if (chatId === ADMIN_ID && text.startsWith("add ")) {

  adminType = text.replace("add ", "");
  adminMode = true;

  return bot.sendMessage(chatId,
   "ارسال کن (هر خط یک کانفیگ)");
 }

 // ---------- SAVE ----------
 if (adminMode && chatId === ADMIN_ID && text !== "done") {

  text.split("\n").forEach(line => {

   if (line.startsWith("vless://")) {

    db.run(`INSERT INTO configs(type,config) VALUES(?,?)`,
     [adminType, line.trim()]);

   }

  });

  return bot.sendMessage(chatId, "ذخیره شد");

 }

 if (text === "done") {
  adminMode = false;
 }

});

// ================= PAYMENT =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 const plans = {
  buy_2: { type: "2GB", usd: 2 },
  buy_5: { type: "5GB", usd: 4 },
  buy_10: { type: "10GB", usd: 9 }
 };

 if (!plans[data]) return;

 db.get(`SELECT * FROM payments WHERE user_id=?`, [chatId], async (e, p) => {

  if (p) {
   return bot.sendMessage(chatId,
    "⚠️ هنوز لینک داری");
  }

  createPay(chatId, plans[data]);

 });

});

// ================= PAYMENT ENGINE =================

async function createPay(chatId, plan) {

 try {

  const res = await axios.get(
   "https://api.plisio.net/api/v1/invoices/new",
   {
    params: {

     api_key: process.env.PLISIO_SECRET_KEY,
     order_name: plan.type,
     source_currency: "USD",
     source_amount: plan.usd,

     // مهم برای TON + BNB
     allowed_psys_cids: "BNB,TON"
    }
   }
  );

  const url = res.data?.data?.invoice_url;

  if (!url) return bot.sendMessage(chatId, "خطا پرداخت");

  db.run(
   `INSERT OR REPLACE INTO payments VALUES(?,?,?,?)`,
   [chatId, plan.type, url, Date.now()]
  );

  bot.sendMessage(chatId,
   "💳 پرداخت ساخته شد (30 دقیقه)",
   {
    reply_markup: {
     inline_keyboard: [[{ text: "پرداخت", url }]]
    }
   }
  );

  setTimeout(() => {
   db.run(`DELETE FROM payments WHERE user_id=?`, [chatId]);
  }, 1800000);

 } catch (e) {

  console.log(e.response?.data || e.message);

  bot.sendMessage(chatId, "❌ خطا در پرداخت");
 }

}

// ================= RUN =================

app.listen(process.env.PORT || 3000, () => {
 console.log("V2 BOT RUNNING");
});
