const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= ACTIVE PAYMENTS =================

const activePayments = {};
const ticketMode = {};
const adminMode = {};

// ================= KEYBOARD =================

function mainKeyboard(userId) {

 return Keyboard.from([

  [
   { text: "🔐 خرید اشتراک" },
   { text: "🛍 سرویس‌های من" }
  ],

  [
   { text: "💰 کیف پول" },
   { text: "🎁 تست رایگان" }
  ],

  [
   { text: "🎫 ارسال تیکت" }
  ],

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
🔹 تعداد کاربر نامحدود
🔸 پشتیبانی دائمی`

 ,
 {
  reply_markup: mainKeyboard(userId)
 });

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= WALLET =================

 if (text === "💰 کیف پول") {

  const balance = db.getBalance(userId);

  return ctx.reply(
`💰 موجودی کیف پول:

${balance} تومان`
  );

 }

 // ================= BUY =================

 if (text === "🔐 خرید اشتراک") {

  const keyboard = new InlineKeyboard()

   .text("2GB - 340,000", "buy_2")
   .row()

   .text("5GB - 800,000", "buy_5")
   .row()

   .text("10GB - 1,500,000", "buy_10");

  return ctx.reply(
   "📦 پلن موردنظر را انتخاب کنید",
   {
    reply_markup: keyboard
   }
  );

 }

 // ================= MY SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length) {
   return ctx.reply("❌ سرویسی ندارید");
  }

  for (const s of services) {

   await ctx.reply(
`📦 ${s.type}

${s.config}`
   );

   try {

    const qr = await QRCode.toBuffer(s.config);

    await ctx.replyWithPhoto(
     new Blob([qr])
    );

   } catch {}

  }

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user.free_used) {
   return ctx.reply("❌ قبلاً استفاده شده");
  }

  const cfg = db.getConfig("FREE");

  if (!cfg) {
   return ctx.reply("❌ تست موجود نیست");
  }

  db.useConfig(cfg.id);
  db.setFreeUsed(userId);

  db.addPurchase(
   userId,
   "20MB TEST",
   cfg.config
  );

  await ctx.reply(
`🎁 تست رایگان:

${cfg.config}`
  );

  try {

   const qr = await QRCode.toBuffer(cfg.config);

   await ctx.replyWithPhoto(
    new Blob([qr])
   );

  } catch {}

 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  ticketMode[userId] = true;

  return ctx.reply(
`✍️ پیام خود را ارسال کنید

لغو:
/cancel`
  );

 }

 if (text === "/cancel") {

  delete ticketMode[userId];

  return ctx.reply("❌ لغو شد");

 }

 if (ticketMode[userId]) {

  delete ticketMode[userId];

  await bot.api.sendMessage(

   config.adminId,

`🎫 تیکت جدید

👤 ${userId}

📩 ${text}`

  );

  return ctx.reply("✅ ارسال شد");

 }

 // ================= ADMIN =================

 if (
  text === "⚙️ مدیریت"
  &&
  userId == config.adminId
 ) {

  return ctx.reply(
`ارسال:

add 2GB
add 5GB
add 10GB
add FREE`
  );

 }

 if (
  text.startsWith("add ")
  &&
  userId == config.adminId
 ) {

  adminMode[userId] =
   text.replace("add ", "");

  return ctx.reply(
`کانفیگ‌ها را بفرست

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

   return ctx.reply("✅ پایان");

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

 // ضد اسپم
 if (activePayments[userId]) {

  return ctx.reply(
`⚠️ لینک پرداخت فعال دارید

${activePayments[userId].url}

لغو:
/cancelpay`
  );

 }

 try {

  const res = await axios.post(

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
   res.data.invoice_url;

  activePayments[userId] = {
   url,
   plan: plan.type
  };

  // expire 20 min
  setTimeout(async () => {

   if (!activePayments[userId])
    return;

   delete activePayments[userId];

   try {

    await bot.api.sendMessage(
     userId,
     "⌛ لینک پرداخت منقضی شد"
    );

   } catch {}

  }, 20 * 60 * 1000);

  return ctx.reply(
`💳 لینک پرداخت:

${url}

⏰ اعتبار: 20 دقیقه`
  );

 } catch (e) {

  console.log(
   e.response?.data || e.message
  );

  return ctx.reply(
   "❌ خطا در پرداخت"
  );

 }

}

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data =
  ctx.callbackQuery.data;

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

 return createPayment(
  ctx,
  plans[data]
 );

});

// ================= CANCEL PAYMENT =================

bot.command(
 "cancelpay",
 async (ctx) => {

  const userId = ctx.from.id;

  if (!activePayments[userId]) {
   return ctx.reply(
    "❌ پرداخت فعالی ندارید"
   );
  }

  delete activePayments[userId];

  return ctx.reply(
   "✅ لینک لغو شد"
  );

 }
);

// ================= WEBHOOK =================

app.post(
 "/webhook",
 async (req, res) => {

  try {

   const body = req.body;

   if (
    body.payment_status
    !== "finished"
   ) {
    return res.sendStatus(200);
   }

   const orderId =
    body.order_id;

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
     new Blob([qr])
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
  console.log("Server Started");
 }
);

// ================= START BOT =================

bot.start();

console.log("Bot Started");
