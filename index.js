
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, {
 polling: false
});

const db = new sqlite3.Database("./database.db");

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ================= DB =================

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
  type TEXT,
  config TEXT
 )`);

 db.run(`CREATE TABLE IF NOT EXISTS payments (
  user_id INTEGER PRIMARY KEY,
  plan TEXT,
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
`سلام و درود به ربات VPN Mirza خوش آمدید

🔸 زمان سرویس ها نامحدود هست
🔹 سرویس ها پایدار و سریع هستند
🔸 تلاش تیم برای حفظ کیفیت اتصال کاربران`
 , menu(chatId));

});

// ================= TEXT =================

let adminMode = false;
let adminType = "";

bot.on("message", async (msg) => {

 const chatId = msg.chat.id;
 const text = msg.text;

 if (!text) return;

 // ---------------- BUY ----------------

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

 // ---------------- FREE ----------------

 if (text === "🎁 تست رایگان") {

  db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, u) => {

   if (u.free_used === 1)
    return bot.sendMessage(chatId, "❌ قبلاً استفاده کردی");

   db.get(`SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`, [], (e, cfg) => {

    if (!cfg)
     return bot.sendMessage(chatId, "❌ موجود نیست");

    db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
    db.run(`UPDATE configs SET used=1 WHERE id=?`, [cfg.id]);

    db.run(`INSERT INTO services(user_id,type,config) VALUES(?,?,?)`, [
     chatId,
     "20MB TEST",
     cfg.config
    ]);

    bot.sendMessage(chatId, "🎁 تست 20MB:\n\n" + cfg.config);

   });

  });

 }

 // ---------------- MY ----------------

 if (text === "📦 سرویس های من") {

  db.all(`SELECT * FROM services WHERE user_id=?`, [chatId], (e, rows) => {

   if (!rows.length)
    return bot.sendMessage(chatId, "خالیه");

   let t = "سرویس های شما:\n\n";

   rows.forEach(r => {
    t += `${r.type}\n${r.config}\n\n`;
   });

   bot.sendMessage(chatId, t);

  });

 }

 // ---------------- ADMIN ----------------

 if (text === "⚙️ مدیریت" && chatId === ADMIN_ID) {

  return bot.sendMessage(chatId,
   "ارسال کن:\nadd 2GB / add FREE"
  );

 }

 // ---------------- ADD MODE ----------------

 if (chatId === ADMIN_ID && text.startsWith("add ")) {

  adminType = text.replace("add ", "");
  adminMode = true;

  return bot.sendMessage(chatId,
   "حالا کانفیگ ها رو بفرست (هر خط یکی)"
  );

 }

 // ---------------- SAVE CONFIG ----------------

 if (adminMode && chatId === ADMIN_ID && text !== "done") {

  text.split("\n").forEach(line => {

   if (line.startsWith("vless://")) {

    db.run(`INSERT INTO configs(type,config) VALUES(?,?)`, [
     adminType,
     line.trim()
    ]);

   }

  });

  return bot.sendMessage(chatId, "ذخیره شد");

 }

 if (text === "done" && chatId === ADMIN_ID) {
  adminMode = false;
  return bot.sendMessage(chatId, "تمام شد");
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

 const plan = plans[data];

 db.get(`SELECT * FROM payments WHERE user_id=?`, [chatId], async (e, old) => {

  if (old) {
   return bot.sendMessage(chatId, "لینک داری هنوز");
  }

  createPay(chatId, plan);

 });

});

// ================= CREATE PAY =================

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
     currency: "TON"
    }
   }
  );

  const url = res.data?.data?.invoice_url;

  db.run(`INSERT OR REPLACE INTO payments VALUES(?,?,?)`, [
   chatId,
   plan.type,
   Date.now()
  ]);

  bot.sendMessage(chatId,
   "پرداخت ساخته شد",
   {
    reply_markup: {
     inline_keyboard: [[{ text: "PAY", url }]]
    }
   }
  );

  setTimeout(() => {
   db.run(`DELETE FROM payments WHERE user_id=?`, [chatId]);
  }, 1800000);

 } catch (e) {

  bot.sendMessage(chatId, "خطا پرداخت");
 }

}

// ================= RUN =================

app.listen(process.env.PORT || 3000, () => {
 console.log("RUNNING");
});
