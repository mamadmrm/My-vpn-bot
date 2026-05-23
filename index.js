require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
app.use(express.json());

// ================= BOT =================

const bot = new TelegramBot(
 process.env.BOT_TOKEN,
 { polling: false }
);

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

db.run(`
CREATE TABLE IF NOT EXISTS payments (
 chat_id INTEGER PRIMARY KEY,
 pay_url TEXT,
 created_at INTEGER
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

  console.log(e.message);

 }

 res.sendStatus(200);

});

// ================= ADMIN STATE =================

let waitingAdmin = false;
let waitingType = "";

// ================= START =================

bot.onText(/\/start/, async (msg) => {

 const chatId = msg.chat.id;

 db.run(
  `INSERT OR IGNORE INTO users(id)
   VALUES(?)`,
  [chatId]
 );

 bot.sendMessage(chatId,
`سلام و درود به ربات VPN Mirza خوش آمدید

🔸 زمان سرویس ها نامحدود هست

🔹 تعداد کاربر سرویس ها نامحدود هست

🔸 سرویس ها با توجه به شرایط حال حاضر اینترنت دارن به فروش میرسن در حال حاضر در تمام کشور با قدرت متصل هست ولی تضمینی بر اتصال آن داده نمیشود ، تیم وی پی ان میرزا تمام تلاشش رو میکنه تا همه متصل بمونیم`
 ,
 {
  reply_markup: {
   keyboard: [

    ["🛒 خرید اشتراک"],

    ["🎁 تست رایگان"],

    ["📦 سرویس های من"],

    ...(chatId === ADMIN_ID
      ? [["⚙️ پنل مدیریت"]]
      : [])

   ],
   resize_keyboard: true
  }
 });

});

// ================= TEXT BUTTONS =================

bot.on("message", async (msg) => {

 const chatId = msg.chat.id;

 const text = msg.text;

 if (!text) return;

 // ================= BUY MENU =================

 if (text === "🛒 خرید اشتراک") {

  return bot.sendMessage(chatId,
   "💰 انتخاب پلن:",
   {
    reply_markup: {
     inline_keyboard: [

      [{ text: "2GB - 340,000 تومان", callback_data: "buy_2" }],

      [{ text: "5GB - 800,000 تومان", callback_data: "buy_5" }],

      [{ text: "10GB - 1,500,000 تومان", callback_data: "buy_10" }]

     ]
    }
   }
  );

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  db.get(
   `SELECT * FROM users
    WHERE id=?`,
   [chatId],
   (err, user) => {

    if (!user) {

     db.run(
      `INSERT INTO users(id,free_used)
       VALUES(?,0)`,
      [chatId]
     );

     user = { free_used: 0 };

    }

    // فقط 1 بار
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
     (err, row) => {

      if (!row) {

       return bot.sendMessage(chatId,
        "❌ تست رایگان موجود نیست");

      }

      db.run(
       `UPDATE users
        SET free_used=1
        WHERE id=?`,
       [chatId]
      );

      db.run(
       `UPDATE configs
        SET used=1
        WHERE id=?`,
       [row.id]
      );

      db.run(
       `INSERT INTO services(user_id,config)
        VALUES(?,?)`,
       [chatId, row.config]
      );

      bot.sendMessage(chatId,
`🎁 تست رایگان 20 مگ شما:

${row.config}

⚠️ فقط جهت تست سرویس`
      );

     }
    );

   }
  );

 }

 // ================= MY SERVICES =================

 if (text === "📦 سرویس های من") {

  db.all(
   `SELECT * FROM services
    WHERE user_id=?`,
   [chatId],
   (err, rows) => {

    if (!rows || rows.length === 0) {

     return bot.sendMessage(chatId,
      "❌ شما سرویسی ندارید");

    }

    let txt = "📦 سرویس های شما:\n\n";

    rows.forEach((r, i) => {

     txt += `🔹 سرویس ${i + 1}\n`;
     txt += `${r.config}\n\n`;

    });

    bot.sendMessage(chatId, txt);

   }
  );

 }

 // ================= ADMIN PANEL =================

 if (text === "⚙️ پنل مدیریت" &&
     chatId === ADMIN_ID) {

  return bot.sendMessage(chatId,
`⚙️ پنل مدیریت

➕ افزودن کانفیگ:
2GB
5GB
10GB
FREE

📥 مثال:
add 2GB
add FREE`
  );

 }

 // ================= ADMIN ADD =================

 if (
  chatId === ADMIN_ID &&
  text.startsWith("add ")
 ) {

  waitingAdmin = true;

  waitingType =
   text.replace("add ", "").trim();

  return bot.sendMessage(chatId,
`📥 حالا همه کانفیگ های ${waitingType}
را پشت سر هم ارسال کن

هر خط = یک کانفیگ

وقتی تمام شد:
done`
  );

 }

 // ================= RECEIVE CONFIGS =================

 if (
  waitingAdmin &&
  chatId === ADMIN_ID &&
  text !== "done"
 ) {

  const lines =
   text.split("\n");

  let count = 0;

  lines.forEach(cfg => {

   if (
    cfg.trim().startsWith("vless://")
   ) {

    db.run(
     `INSERT INTO configs(type,config)
      VALUES(?,?)`,
     [
      waitingType,
      cfg.trim()
     ]
    );

    count++;

   }

  });

  return bot.sendMessage(chatId,
   `✅ ${count} کانفیگ ذخیره شد`);
 }

 // ================= DONE =================

 if (
  waitingAdmin &&
  chatId === ADMIN_ID &&
  text === "done"
 ) {

  waitingAdmin = false;
  waitingType = "";

  return bot.sendMessage(chatId,
   "✅ افزودن کانفیگ تمام شد");
 }

});

// ================= PAYMENT CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;

 const data = q.data;

 // ================= BUY =================

 if (!data.startsWith("buy_"))
  return;

 const plans = {

  buy_2: {
   type: "2GB",
   amount: 2
  },

  buy_5: {
   type: "5GB",
   amount: 4
  },

  buy_10: {
   type: "10GB",
   amount: 9
  }

 };

 const plan = plans[data];

 if (!plan) return;

 // لینک قبلی
 db.get(
  `SELECT * FROM payments
   WHERE chat_id=?`,
  [chatId],
  async (err, oldPay) => {

   if (oldPay) {

    return bot.sendMessage(chatId,
`⚠️ شما یک لینک پرداخت فعال دارید

⏰ اعتبار:
30 دقیقه`
     ,
     {
      reply_markup: {
       inline_keyboard: [

        [{ text: "💳 ادامه پرداخت", url: oldPay.pay_url }],

        [{ text: "❌ حذف و ساخت جدید", callback_data: `new_${data}` }]

       ]
      }
     });

   }

   await createPayment(chatId, plan);

  });

 // ================= NEW LINK =================

 if (data.startsWith("new_")) {

  db.run(
   `DELETE FROM payments
    WHERE chat_id=?`,
   [chatId]
  );

 }

});

// ================= PAYMENT FUNCTION =================

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

     source_currency:
      "USD",

     source_amount:
      plan.amount,

     currency:
      "USDT"

    }
   }
  );

  console.log(response.data);

  const payUrl =
   response.data?.data?.invoice_url;

  if (!payUrl) {

   return bot.sendMessage(chatId,
    "❌ خطا در ساخت پرداخت");

  }

  db.run(
   `INSERT OR REPLACE INTO payments
    (chat_id,pay_url,created_at)
    VALUES(?,?,?)`,
   [
    chatId,
    payUrl,
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
    `DELETE FROM payments
     WHERE chat_id=?`,
    [chatId]
   );

   bot.sendMessage(chatId,
    "⌛ لینک پرداخت شما منقضی شد");

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
