const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

const payments = {};
const tickets = {};

let adminMode = false;
let adminType = "";

// ================= MAIN KEYBOARD =================

function mainKeyboard(userId) {

 return Keyboard.from([

  [{ text: "🔐 خرید اشتراک" }],

  [{ text: "🛍 سرویس‌های من" }],

  [{ text: "🎁 تست رایگان" }],

  [{ text: "🎫 ارسال تیکت" }],

  ...(userId == config.adminId
   ? [[{ text: "⚙️ مدیریت" }]]
   : [])

 ]).resized();

}

// ================= START =================

bot.command("start", async (ctx) => {

 const userId = ctx.from.id;

 db.createUser(
  userId,
  ctx.from.username || "unknown",
  ctx.from.first_name || "User"
 );

 await ctx.reply(

`سلام و درود به ربات VPN Mirza خوش آمدید

🔸 زمان سرویس ها نامحدود هست

🔹 تعداد کاربر سرویس ها نامحدود هست

🔸 تیم وی پی ان میرزا تمام تلاشش رو میکنه تا همه متصل بمونیم`

 ,
 {
  reply_markup: mainKeyboard(userId)
 });

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BUY =================

 if (text === "🔐 خرید اشتراک") {

  const keyboard = new InlineKeyboard()

   .text(
    "یک ماهه - 2 گیگ - 340,000 تومان",
    "buy_2"
   )

   .row()

   .text(
    "یک ماهه - 5 گیگ - 800,000 تومان",
    "buy_5"
   )

   .row()

   .text(
    "یک ماهه - 10 گیگ - 1,500,000 تومان",
    "buy_10"
   )

   .row()

   .text("🔙 بازگشت", "back");

  return ctx.reply(
   "📦 لطفا پلن موردنظر را انتخاب کنید",
   {
    reply_markup: keyboard
   }
  );

 }

 // ================= MY SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services =
   db.getPurchases(userId);

  if (!services.length) {

   return ctx.reply(
    "❌ سرویسی ندارید"
   );

  }

  let msg =
   "📦 سرویس‌های شما:\n\n";

  services.forEach((s) => {

   msg +=
`🔹 ${s.type}

${s.config}

`;

  });

  return ctx.reply(msg);

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user && user.hasFreeTest) {

   return ctx.reply(
    "❌ قبلاً تست رایگان گرفته‌اید"
   );

  }

  const cfg =
   db.getUnusedConfig("FREE");

  if (!cfg) {

   return ctx.reply(
    "❌ تست موجود نیست"
   );

  }

  db.useConfig(cfg.id);

  db.setFreeTestUsed(userId);

  db.addPurchase(
   userId,
   "20MB TEST",
   cfg.config
  );

  return ctx.reply(

`🎁 تست رایگان شما:

${cfg.config}`

  );

 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  tickets[userId] = true;

  return ctx.reply(
`✍️ پیام خود را ارسال کنید

برای لغو:
/cancel`
  );

 }

 if (text === "/cancel") {

  tickets[userId] = false;

  return ctx.reply("❌ لغو شد");

 }

 if (tickets[userId]) {

  tickets[userId] = false;

  await bot.api.sendMessage(

   config.adminId,

`🎫 تیکت جدید

👤 آیدی:
${userId}

📩 پیام:
${text}`

  );

  return ctx.reply(
   "✅ تیکت ارسال شد"
  );

 }

 // ================= ADMIN =================

 if (
  text === "⚙️ مدیریت"
  &&
  userId == config.adminId
 ) {

  return ctx.reply(

`ارسال کنید:

add 2GB
add 5GB
add 10GB
add FREE`

  );

 }

 // ================= ADMIN MODE =================

 if (
  text.startsWith("add ")
  &&
  userId == config.adminId
 ) {

  adminMode = true;

  adminType =
   text.replace("add ", "").trim();

  return ctx.reply(

`کانفیگ‌ها را بفرست

هر خط = یک کانفیگ

پایان:
done`

  );

 }

 // ================= SAVE CONFIG =================

 if (
  adminMode
  &&
  userId == config.adminId
  &&
  text !== "done"
 ) {

  let count = 0;

  text.split("\n").forEach(line => {

   if (
    line.startsWith("vless://")
   ) {

    db.addConfig(
     adminType,
     line.trim()
    );

    count++;

   }

  });

  return ctx.reply(
   `✅ ${count} کانفیگ ذخیره شد`
  );

 }

 if (
  text === "done"
  &&
  userId == config.adminId
 ) {

  adminMode = false;

  return ctx.reply(
   "✅ پایان افزودن"
  );

 }

});

// ================= CALLBACKS =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 // ================= BACK =================

 if (data === "back") {

  return ctx.deleteMessage();

 }

 // ================= PLANS =================

 const plans = {

  buy_2: {
   type: "2GB",
   price: 2
  },

  buy_5: {
   type: "5GB",
   price: 4
  },

  buy_10: {
   type: "10GB",
   price: 8
  }

 };

 if (!plans[data]) return;

 // ================= ACTIVE LINK =================

 if (payments[userId]) {

  const remain =
   20 - Math.floor(
    (Date.now() -
     payments[userId].time)
     / 60000
   );

  if (remain > 0) {

   return ctx.reply(

`⚠️ لینک فعال دارید

${payments[userId].url}

⏰ ${remain} دقیقه باقی مانده`

   );

  }

  delete payments[userId];

  db.clearPendingPayment(userId);

 }

 // ================= CREATE PAYMENT =================

 try {

  const plan = plans[data];

  const response =
   await axios.post(

    "https://api.nowpayments.io/v1/invoice",

    {
     price_amount: plan.price,
     price_currency: "usd",
     order_id:
      `${userId}_${Date.now()}`,
     order_description:
      plan.type
    },

    {
     headers: {
      "x-api-key":
       config.nowPaymentsApiKey
     }
    }

   );

  const url =
   response.data.invoice_url;

  payments[userId] = {

   url,
   plan: plan.type,
   time: Date.now()

  };

  db.setPendingPayment(
   userId,
   plan.type
  );

  // ================= AUTO EXPIRE =================

  setTimeout(async () => {

   if (!payments[userId]) return;

   const elapsed =
    (Date.now() -
     payments[userId].time)
     / 60000;

   if (elapsed >= 20) {

    delete payments[userId];

    db.clearPendingPayment(
     userId
    );

    try {

     await bot.api.sendMessage(

      userId,

      "⌛ لینک پرداخت منقضی شد"

     );

    } catch {}

   }

  }, 20 * 60 * 1000);

  const payKeyboard =
   new InlineKeyboard()

   .url(
    "💳 پرداخت",
    url
   )

   .row()

   .text(
    "✅ بررسی پرداخت",
    "check_payment"
   );

  return ctx.reply(

`💰 لینک پرداخت ساخته شد

⏰ اعتبار:
20 دقیقه`

  ,
  {
   reply_markup: payKeyboard
  });

 } catch (e) {

  console.log(
   e.response?.data || e.message
  );

  return ctx.reply(
   "❌ خطا در پرداخت"
  );

 }

 // ================= CHECK =================

});

bot.callbackQuery(
 "check_payment",
 async (ctx) => {

  const userId = ctx.from.id;

  const pending =
   db.getPendingPayment(userId);

  if (!pending) {

   return ctx.reply(
    "❌ پرداختی ندارید"
   );

  }

  const cfg =
   db.getUnusedConfig(
    pending.plan
   );

  if (!cfg) {

   return ctx.reply(
    "❌ کانفیگ موجود نیست"
   );

  }

  db.useConfig(cfg.id);

  db.addPurchase(
   userId,
   pending.plan,
   cfg.config
  );

  db.clearPendingPayment(
   userId
  );

  delete payments[userId];

  return ctx.reply(

`✅ کانفیگ شما:

${cfg.config}`

  );

 });

// ================= SERVER =================

app.get("/", (req, res) => {

 res.send("BOT RUNNING");

});

const PORT =
 process.env.PORT || 3000;

app.listen(PORT, () => {

 console.log(
  "Server Started"
 );

});

// ================= BOT =================

bot.start();

console.log("Bot Started");
