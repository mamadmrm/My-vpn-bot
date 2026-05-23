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

// ================= DATABASE =================

db.serialize(() => {

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
  type TEXT,
  config TEXT
 )
 `);

 db.run(`
 CREATE TABLE IF NOT EXISTS payments (
  user_id INTEGER PRIMARY KEY,
  pay_url TEXT,
  plan TEXT,
  created_at INTEGER
 )
 `);

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

// ================= START =================

function mainMenu(chatId) {

 return {

  reply_markup: {

   resize_keyboard: true,

   keyboard: [

    ["🛒 خرید اشتراک"],

    ["🎁 تست رایگان", "📦 سرویس های من"],

    ...(chatId === ADMIN_ID
     ? [["⚙️ مدیریت"]]
     : [])

   ]

  }

 };

}

bot.onText(/\/start/, async (msg) => {

 const chatId = msg.chat.id;

 db.run(
  `INSERT OR IGNORE INTO users(id) VALUES(?)`,
  [chatId]
 );

 bot.sendMessage(chatId,

`سلام و درود به ربات VPN Mirza خوش آمدید

🔸 زمان سرویس ها نامحدود هست

🔹 تعداد کاربر سرویس ها نامحدود هست

🔸 سرویس ها با توجه به شرایط حال حاضر اینترنت دارن به فروش میرسن در حال حاضر در تمام کشور با قدرت متصل هست ولی تضمینی بر اتصال آن داده نمیشود ، تیم وی پی ان میرزا تمام تلاشش رو میکنه تا همه متصل بمونیم`

 , mainMenu(chatId));

});

// ================= ADMIN STATE =================

let adminMode = {};
let adminType = {};

// ================= MESSAGE =================

bot.on("message", async (msg) => {

 const chatId = msg.chat.id;

 const text = msg.text;

 if (!text) return;

 // ================= BUY =================

 if (text === "🛒 خرید اشتراک") {

  return bot.sendMessage(chatId,

   "💰 انتخاب پلن:",

   {
    reply_markup: {
     inline_keyboard: [

      [{ text: "2GB - 340,000 تومان", callback_data: "buy_2GB" }],

      [{ text: "5GB - 800,000 تومان", callback_data: "buy_5GB" }],

      [{ text: "10GB - 1,500,000 تومان", callback_data: "buy_10GB" }]

     ]
    }
   }

  );

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  db.get(
   `SELECT * FROM users WHERE id=?`,
   [chatId],
   (err, user) => {

    if (user.free_used === 1) {

     return bot.sendMessage(chatId,
      "❌ شما قبلاً تست رایگان دریافت کرده‌اید");

    }

    db.get(
     `SELECT * FROM configs
      WHERE type='FREE'
      AND used=0
      LIMIT 1`,
     [],
     (err, cfg) => {

      if (!cfg) {

       return bot.sendMessage(chatId,
        "❌ تست رایگان موجود نیست");

      }

      db.run(
       `UPDATE users SET free_used=1 WHERE id=?`,
       [chatId]
      );

      db.run(
       `UPDATE configs SET used=1 WHERE id=?`,
       [cfg.id]
      );

      db.run(
       `INSERT INTO services(user_id,type,config)
        VALUES(?,?,?)`,
       [chatId, "20MB TEST", cfg.config]
      );

      bot.sendMessage(chatId,

`🎁 تست رایگان 20 مگ:

${cfg.config}

⚠️ فقط جهت تست`

      );

     }
    );

   }
  );

 }

 // ================= MY SERVICES =================

 if (text === "📦 سرویس های من") {

  db.all(
   `SELECT * FROM services WHERE user_id=?`,
   [chatId],
   (err, rows) => {

    if (!rows || rows.length === 0) {

     return bot.sendMessage(chatId,
      "❌ شما سرویسی ندارید");

    }

    let txt = "📦 سرویس های شما:\n\n";

    rows.forEach((s, i) => {

     txt += `🔹 ${s.type}\n`;
     txt += `${s.config}\n\n`;

    });

    bot.sendMessage(chatId, txt);

   }
  );

 }

 // ================= ADMIN =================

 if (
  text === "⚙️ مدیریت" &&
  chatId === ADMIN_ID
 ) {

  return bot.sendMessage(chatId,

`⚙️ پنل مدیریت

ارسال کن:

add 2GB
add 5GB
add 10GB
add FREE`

  );

 }

 // ================= ADD MODE =================

 if (
  chatId === ADMIN_ID &&
  text.startsWith("add ")
 ) {

  const type =
   text.replace("add ", "").trim();

  adminMode[chatId] = true;
  adminType[chatId] = type;

  return bot.sendMessage(chatId,

`📥 حالا کانفیگ های ${type} را ارسال کن

هر خط = یک کانفیگ

وقتی تمام شد:
done`

  );

 }

 // ================= SAVE CONFIGS =================

 if (
  adminMode[chatId] &&
  chatId === ADMIN_ID &&
  text !== "done"
 ) {

  const lines =
   text.split("\n");

  let saved = 0;

  lines.forEach(line => {

   if (
    line.trim().startsWith("vless://")
   ) {

    db.run(
     `INSERT INTO configs(type,config)
      VALUES(?,?)`,
     [
      adminType[chatId],
      line.trim()
     ]
    );

    saved++;

   }

  });

  return bot.sendMessage(chatId,
   `✅ ${saved} کانفیگ ذخیره شد`);

 }

 // ================= DONE =================

 if (
  adminMode[chatId] &&
  text === "done"
 ) {

  adminMode[chatId] = false;

  return bot.sendMessage(chatId,
   "✅ افزودن کانفیگ پایان یافت");

 }

});

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;

 const data = q.data;

 // ================= PLANS =================

 const plans = {

  buy_2GB: {
   type: "2GB",
   usd: 2
  },

  buy_5GB: {
   type: "5GB",
   usd: 4
  },

  buy_10GB: {
   type: "10GB",
   usd: 9
  }

 };

 // ================= NEW LINK =================

 if (data.startsWith("new_")) {

  db.run(
   `DELETE FROM payments WHERE user_id=?`,
   [chatId]
  );

  const key =
   data.replace("new_", "");

  return createPayment(
   chatId,
   plans[key]
  );

 }

 // ================= BUY =================

 if (plans[data]) {

  db.get(
   `SELECT * FROM payments WHERE user_id=?`,
   [chatId],
   async (err, pay) => {

    if (pay) {

     return bot.sendMessage(chatId,

`⚠️ شما یک لینک پرداخت فعال دارید

⏰ اعتبار:
30 دقیقه`

      ,
      {
       reply_markup: {
        inline_keyboard: [

         [{ text: "💳 ادامه پرداخت", url: pay.pay_url }],

         [{ text: "♻️ ساخت لینک جدید", callback_data: `new_${data}` }]

        ]
       }
      });

    }

    createPayment(chatId, plans[data]);

   }
  );

 }

});

// ================= CREATE PAYMENT =================

async function createPayment(chatId, plan) {

 try {

  const response = await axios.get(

   "https://api.plisio.net/api/v1/invoices/new",

   {
    params: {

     api_key:
      process.env.PLISIO_SECRET_KEY,

     order_name:
      plan.type,

     order_number:
      `${chatId}_${Date.now()}`,

     source_currency:
      "USD",

     source_amount:
      plan.usd,

     allowed_psys_cids:
      "BNB,TON",

     currency:
      "USDT"

    }
   }

  );

  console.log(response.data);

  if (
   response.data.status !== "success"
  ) {

   return bot.sendMessage(chatId,
    "❌ خطا در ساخت پرداخت");

  }

  const payUrl =
   response.data.data.invoice_url;

  db.run(
   `INSERT OR REPLACE INTO payments
    (user_id,pay_url,plan,created_at)
    VALUES(?,?,?,?)`,
   [
    chatId,
    payUrl,
    plan.type,
    Date.now()
   ]
  );

  bot.sendMessage(chatId,

`💳 لینک پرداخت ساخته شد

⏰ اعتبار:
30 دقیقه`

  ,
  {
   reply_markup: {
    inline_keyboard: [

     [{ text: "💰 پرداخت", url: payUrl }]

    ]
   }
  });

  // حذف بعد 30 دقیقه
  setTimeout(() => {

   db.run(
    `DELETE FROM payments WHERE user_id=?`,
    [chatId]
   );

   bot.sendMessage(chatId,
    "⌛ لینک پرداخت منقضی شد");

  }, 30 * 60 * 1000);

 } catch (e) {

  console.log(
   e.response?.data || e.message
  );

  bot.sendMessage(chatId,
   "❌ خطا در پرداخت");

 }

}

// ================= SERVER =================

app.listen(
 process.env.PORT || 3000,
 () => {

  console.log("BOT RUNNING");

 });
