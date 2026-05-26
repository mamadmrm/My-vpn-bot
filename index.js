const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= STATE =================

const activePayments = {};
const ticketMode = {};
const adminMode = {};
const replyMode = {};

let botEnabled = true;

// ================= KEYBOARD =================

function mainKeyboard(userId) {

 return Keyboard.from([

  [
   { text: "🔐 خرید اشتراک" },
   { text: "🛍 سرویس‌های من" }
  ],

  [
   { text: "🎁 تست رایگان" },
   { text: "🎫 ارسال تیکت" }
  ],

  ...(userId == config.adminId
   ? [
      [{ text: "⚙️ مدیریت کانفیگ" }],
      [{ text: "🟢 روشن کردن ربات" }],
      [{ text: "🔴 خاموش کردن ربات" }]
     ]
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

// ================= BOT OFF CHECK =================

bot.use(async (ctx, next) => {

 const userId = ctx.from?.id;

 if (
  !botEnabled &&
  userId != config.adminId
 ) {

  return ctx.reply(
   "🔴 ربات در حال حاضر خاموش است"
  );

 }

 await next();

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BOT CONTROL =================

 if (
  text === "🔴 خاموش کردن ربات"
  &&
  userId == config.adminId
 ) {

  botEnabled = false;

  return ctx.reply(
   "🔴 ربات خاموش شد"
  );

 }

 if (
  text === "🟢 روشن کردن ربات"
  &&
  userId == config.adminId
 ) {

  botEnabled = true;

  return ctx.reply(
   "🟢 ربات روشن شد"
  );

 }

 // ================= BUY =================

 if (text === "🔐 خرید اشتراک") {

  const keyboard = new InlineKeyboard()

   .text("2 گیگ - 340 هزار تومان", "buy_2")
   .row()
   .text("5 گیگ - 800 هزار تومان", "buy_5")
   .row()
   .text("10 گیگ - 1,500,000 تومان", "buy_10");

  return ctx.reply(
   "📦 پلن موردنظر را انتخاب کنید",
   { reply_markup: keyboard }
  );

 }

 // ================= SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length)
   return ctx.reply("❌ سرویسی ندارید");

  for (const s of services) {

   await ctx.reply(`📦 ${s.type}\n\n${s.config}`);

   try {

    const qr = await QRCode.toBuffer(s.config);

    await ctx.replyWithPhoto({
     source: qr
    });

   } catch {}

  }

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user.free_used)
   return ctx.reply("❌ قبلاً تست دریافت کرده‌اید");

  const cfg = db.getConfig("FREE");

  if (!cfg)
   return ctx.reply("❌ تست موجود نیست");

  db.useConfig(cfg.id);

  db.setFreeUsed(userId);

  db.addPurchase(
   userId,
   "20MB TEST",
   cfg.config
  );

  await ctx.reply(
   `🎁 تست رایگان:\n\n${cfg.config}`
  );

 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  ticketMode[userId] = true;

  return ctx.reply(
   "✍️ پیام خود را ارسال کنید"
  );

 }

 if (
  ticketMode[userId]
  &&
  userId != config.adminId
 ) {

  delete ticketMode[userId];

  await bot.api.sendMessage(

   config.adminId,

`🎫 تیکت جدید

👤 ${userId}

📩 ${text}`,

   {
    reply_markup: {
     inline_keyboard: [
      [
       {
        text: "💬 پاسخ",
        callback_data: `reply_${userId}`
       }
      ]
     ]
    }
   }

  );

  return ctx.reply(
   "✅ تیکت ارسال شد"
  );

 }

 // ================= ADMIN REPLY =================

 if (
  userId == config.adminId
  &&
  replyMode[userId]
 ) {

  const target =
   replyMode[userId];

  await bot.api.sendMessage(

   target,

`📩 پاسخ پشتیبانی:

${text}`

  );

  delete replyMode[userId];

  return ctx.reply(
   "✅ پاسخ ارسال شد"
  );

 }

 // ================= ADMIN PANEL =================

 if (
  text === "⚙️ مدیریت کانفیگ"
  &&
  userId == config.adminId
 ) {

  return ctx.reply(

`⚙️ پنل مدیریت

📥 افزودن کانفیگ:

add 2GB
add 5GB
add 10GB
add FREE

📊 آمار:
stats`

  );

 }

 // ================= STATS =================

 if (
  text === "stats"
  &&
  userId == config.adminId
 ) {

  return ctx.reply("📊 پنل آمار");

 }

 // ================= ADD CONFIG =================

 if (
  text.startsWith("add ")
  &&
  userId == config.adminId
 ) {

  adminMode[userId] =
   text.replace("add ", "");

  return ctx.reply(

`📥 کانفیگ‌ها را ارسال کنید

هر خط = یک کانفیگ

پایان:
done`

  );

 }

 if (
  adminMode[userId]
  &&
  userId == config.adminId
 ) {

  if (text === "done") {

   delete adminMode[userId];

   return ctx.reply(
    "✅ پایان افزودن"
   );

  }

  let count = 0;

  text.split("\n").forEach(line => {

   if (
    line.startsWith("vless://")
   ) {

    db.addConfig(
     adminMode[userId],
     line.trim()
    );

    count++;

   }

  });

  return ctx.reply(
   `✅ ${count} کانفیگ ذخیره شد`
  );

 }

});

// ================= PAYMENT =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId]) {

  return ctx.reply(
   "⚠️ یک پرداخت فعال دارید"
  );

 }

 try {

  const res = await axios.post(
 "https://api.plisio.net/api/v1/invoices/new",
 new URLSearchParams({
  source_currency: "USD",
  source_amount: plan.price,
  order_number: `${userId}_${Date.now()}`,
  currency: "TON",
  email: "test@test.com",
  callback_url: "https://my-vpn-bot-production.up.railway.app/webhook",
  api_key: config.plisioApiKey
 })
);

  const invoice =
   res.data.data.invoice_url;

  activePayments[userId] = {

   url: invoice,
   plan: plan.type,

   timer: setTimeout(async () => {

    delete activePayments[userId];

    try {

     await bot.api.sendMessage(
      userId,
      "⌛ لینک پرداخت منقضی شد"
     );

    } catch {}

   }, 20 * 60 * 1000)

  };

  const keyboard =
   new InlineKeyboard()

   .url(
    "💰 پرداخت با TON",
    invoice
   )

   .row()

   .text(
    "❌ لغو پرداخت",
    "cancel_payment"
   );

  return ctx.reply(

`💳 لینک پرداخت ساخته شد

⏰ اعتبار: 20 دقیقه`,

   {
    reply_markup: keyboard
   }

  );

 } catch (e) {

  console.log(
   e.response?.data || e.message
  );

  return ctx.reply(
   "❌ خطا در ساخت لینک پرداخت"
  );

 }

}

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data =
  ctx.callbackQuery.data;

 const userId =
  ctx.from.id;

 // ================= REPLY =================

 if (
  data.startsWith("reply_")
  &&
  userId == config.adminId
 ) {

  const target =
   data.split("_")[1];

  replyMode[userId] =
   target;

  return ctx.reply(
   "✍️ پاسخ را ارسال کنید"
  );

 }

 // ================= CANCEL PAYMENT =================

 if (data === "cancel_payment") {

  if (!activePayments[userId]) {

   return ctx.reply(
    "❌ پرداختی ندارید"
   );

  }

  clearTimeout(
   activePayments[userId].timer
  );

  delete activePayments[userId];

  try {

   await ctx.editMessageText(
    "❌ لینک پرداخت لغو شد"
   );

  } catch {}

  return ctx.reply(
   "✅ پرداخت لغو شد"
  );

 }

 // ================= BUY =================

 const plans = {

  buy_2: {
   type: "2GB",
   price: 1.28
  },

  buy_5: {
   type: "5GB",
   price: 2.14
  },

  buy_10: {
   type: "10GB",
   price: 4.45
  }

 };

 if (!plans[data]) return;

 return createPayment(
  ctx,
  plans[data]
 );

});

// ================= WEBHOOK =================

app.post(
 "/webhook",
 async (req, res) => {

  try {

   console.log(req.body);

   const body = req.body;

   if (
    body.status !== "completed"
   ) {
    return res.sendStatus(200);
   }

   const orderId =
    body.order_number;

   const userId =
    Number(
     orderId.split("_")[0]
    );

   const payment =
    activePayments[userId];

   if (!payment) {
    return res.sendStatus(200);
   }

   const cfg =
    db.getConfig(payment.plan);

   if (!cfg) {

    await bot.api.sendMessage(
     userId,
     "❌ کانفیگ موجود نیست"
    );

    return res.sendStatus(200);

   }

   db.useConfig(cfg.id);

   db.addPurchase(
    userId,
    payment.plan,
    cfg.config
   );

   clearTimeout(payment.timer);

   delete activePayments[userId];

   await bot.api.sendMessage(

    userId,

`✅ پرداخت تایید شد

📦 کانفیگ شما:

${cfg.config}`

   );

   try {

    const qr =
     await QRCode.toBuffer(
      cfg.config
     );

    await bot.api.sendPhoto(
     userId,
     { source: qr }
    );

   } catch {}

  } catch (e) {

   console.log(e);

  }

  res.sendStatus(200);

 }
);

// ================= SERVER =================

app.get("/", (req, res) => {

 res.send("BOT RUNNING");

});

app.listen(

 process.env.PORT || 3000,

 () => {

  console.log(
   "Server Started"
  );

 }

);

// ================= START BOT =================

bot.start();

console.log("Bot Started");
