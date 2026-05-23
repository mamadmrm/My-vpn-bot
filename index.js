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

 try {

  bot.processUpdate(req.body);

 } catch (e) {

  console.log(e.message);

 }

 res.sendStatus(200);

});

// ================= START =================

bot.onText(/\/start/, (msg) => {

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
   inline_keyboard: [

    [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],

    [{ text: "🎁 تست رایگان", callback_data: "free" }],

    [{ text: "📦 سرویس های من", callback_data: "my" }],

    ...(chatId === ADMIN_ID
      ? [[{ text: "⚙️ پنل مدیریت", callback_data: "admin" }]]
      : [])

   ]
  }
 });

});

// ================= ADMIN =================

let waitingAdmin = false;
let waitingType = "";

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {

 const chatId = q.message.chat.id;
 const data = q.data;

 // ================= BUY MENU =================

 if (data === "buy") {

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

 // ================= BUY =================

 if (data.startsWith("buy_")) {

  const plans = {

   buy_2: {
    type: "2GB",
    usd: 2
   },

   buy_5: {
    type: "5GB",
    usd: 4
   },

   buy_10: {
    type: "10GB",
    usd: 9
   }

  };

  const plan = plans[data];

  if (!plan) return;

  db.get(
   `SELECT * FROM payments
    WHERE chat_id=?`,
   [chatId],
   async (err, oldPay) => {

    // لینک فعال قبلی
    if (oldPay) {

     return bot.sendMessage(chatId,
      "⚠️ شما یک لینک پرداخت فعال دارید",
      {
       reply_markup: {
        inline_keyboard: [

         [{ text: "💳 ادامه پرداخت", url: oldPay.pay_url }],

         [{ text: "❌ حذف لینک قبلی", callback_data: `new_${data}` }]

        ]
       }
      }
     );

    }

    await createPayment(chatId, plan);

   }
  );

 }

 // ================= NEW PAYMENT =================

 if (data.startsWith("new_")) {

  db.run(
   `DELETE FROM payments
    WHERE chat_id=?`,
   [chatId]
  );

  const plans = {

   new_buy_2: {
    type: "2GB",
    usd: 2
   },

   new_buy_5: {
    type: "5GB",
    usd: 4
   },

   new_buy_10: {
    type: "10GB",
    usd: 9
   }

  };

  await createPayment(chatId, plans[data]);

 }

 // ================= FREE TEST =================

 if (data === "free") {

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

     user = {
      free_used: 0
     };

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
`🎁 تست رایگان 20 گیگ شما:

${row.config}

⚠️ فقط جهت تست سرویس`
      );

     }
    );

   }
  );

 }

 // ================= MY SERVICES =================

 if (data === "my") {

  db.all(
   `SELECT * FROM services
    WHERE user_id=?`,
   [chatId],
   (err, rows) => {

    if (!rows || rows.length === 0) {

     return bot.sendMessage(chatId,
      "❌ شما سرویسی ندارید");

    }

    let text = "📦 سرویس های شما:\n\n";

    rows.forEach((r, i) => {

     text += `🔹 سرویس ${i + 1}\n`;
     text += `${r.config}\n\n`;

    });

    bot.sendMessage(chatId, text);

   }
  );

 }

 // ================= ADMIN PANEL =================

 if (data === "admin" && chatId === ADMIN_ID) {

  return bot.sendMessage(chatId,
   "⚙️ پنل مدیریت",
   {
    reply_markup: {
     inline_keyboard: [

      [{ text: "➕ افزودن 2GB", callback_data: "add_2GB" }],

      [{ text: "➕ افزودن 5GB", callback_data: "add_5GB" }],

      [{ text: "➕ افزودن 10GB", callback_data: "add_10GB" }],

      [{ text: "➕ افزودن FREE", callback_data: "add_FREE" }]

     ]
    }
   }
  );

 }

 // ================= ADD CONFIG =================

 if (data.startsWith("add_") && chatId === ADMIN_ID) {

  waitingAdmin = true;

  waitingType = data.replace("add_", "");

  return bot.sendMessage(chatId,
   `📥 کانفیگ ${waitingType} را ارسال کنید`);
 }

});

// ================= ADMIN RECEIVE CONFIG =================

bot.on("message", (msg) => {

 const chatId = msg.chat.id;

 if (chatId !== ADMIN_ID) return;

 if (!waitingAdmin) return;

 if (!msg.text) return;

 if (!msg.text.startsWith("vless://")) {

  return bot.sendMessage(chatId,
   "❌ کانفیگ باید با vless:// شروع شود");

 }

 db.run(
  `INSERT INTO configs(type,config)
   VALUES(?,?)`,
  [waitingType, msg.text]
 );

 waitingAdmin = false;

 bot.sendMessage(chatId,
  `✅ کانفیگ ${waitingType} ذخیره شد`);

});

// ================= CREATE PAYMENT =================

async function createPayment(chatId, plan) {

 try {

  const orderId =
   `${chatId}_${Date.now()}`;

  const response = await axios.get(
   "https://api.plisio.net/api/v1/invoices/new",
   {
    params: {

     api_key:
      process.env.PLISIO_SECRET_KEY,

     order_number:
      orderId,

     order_name:
      plan.type,

     source_currency:
      "USD",

     source_amount:
      plan.usd,

     currency:
      "USDT",

     email:
      "test@test.com"

    }
   }
  );

  console.log(response.data);

  const payUrl =
   response.data?.data?.invoice_url;

  if (!payUrl) {

   return bot.sendMessage(chatId,
    "❌ خطا در ساخت لینک پرداخت");

  }

  db.run(
   `INSERT OR REPLACE INTO payments
    (chat_id,order_id,pay_url,type,created_at)
    VALUES(?,?,?,?,?)`,
   [
    chatId,
    orderId,
    payUrl,
    plan.type,
    Date.now()
   ]
  );

  bot.sendMessage(chatId,
   "💳 لینک پرداخت ساخته شد\n⏰ اعتبار لینک: 30 دقیقه",
   {
    reply_markup: {
     inline_keyboard: [
      [{ text: "💰 پرداخت", url: payUrl }]
     ]
    }
   }
  );

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

app.listen(process.env.PORT || 3000, () => {

 console.log("BOT RUNNING");

});
