const { Bot, Keyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);

const app = express();
app.use(express.json());

// ================= PAYMENT CACHE =================

let paymentLinks = {};
let paymentTimes = {};

// ================= KEYBOARDS =================

function mainKeyboard(userId) {

 return Keyboard.from([

  [{ text: "🛒 خرید اشتراک" }],

  [{ text: "📦 سرویس‌های من" }, { text: "🎁 تست رایگان" }],

  [{ text: "📞 پشتیبانی" }],

  ...(userId == config.adminId
   ? [[{ text: "⚙️ مدیریت" }]]
   : [])

 ]).resized();

}

function plansKeyboard() {

 return Keyboard.from([

  [{ text: "2 گیگ - 340 هزار تومان" }],

  [{ text: "5 گیگ - 800 هزار تومان" }],

  [{ text: "10 گیگ - 1500000 تومان" }],

  [{ text: "🔄 بررسی پرداخت" }],

  [{ text: "🔙 بازگشت" }]

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

// ================= ADMIN STATE =================

let adminMode = false;
let adminType = "";

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BUY =================

 if (text === "🛒 خرید اشتراک") {

  return ctx.reply(
   "پلن موردنظر را انتخاب کنید:",
   {
    reply_markup: plansKeyboard()
   }
  );

 }

 // ================= BACK =================

 if (text === "🔙 بازگشت") {

  return ctx.reply(
   "منوی اصلی:",
   {
    reply_markup: mainKeyboard(userId)
   }
  );

 }

 // ================= SUPPORT =================

 if (text === "📞 پشتیبانی") {

  return ctx.reply(
   "پشتیبانی:\n@Base_forever"
  );

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  let user = db.getUser(userId);

  if (user && user.hasFreeTest) {

   return ctx.reply(
    "❌ شما قبلاً تست رایگان دریافت کرده‌اید"
   );

  }

  let freeConfig =
   db.getUnusedConfig("FREE");

  if (!freeConfig) {

   return ctx.reply(
    "❌ تست رایگان موجود نیست"
   );

  }

  db.useConfig(freeConfig.id);

  db.addPurchase(
   userId,
   "20MB TEST",
   freeConfig.config
  );

  db.setFreeTestUsed(userId);

  return ctx.reply(

`🎁 تست رایگان 20MB:

${freeConfig.config}`

  );

 }

 // ================= MY SERVICES =================

 if (text === "📦 سرویس‌های من") {

  let services =
   db.getPurchases(userId);

  if (!services || services.length === 0) {

   return ctx.reply(
    "❌ سرویسی ندارید"
   );

  }

  let msg = "📦 سرویس‌های شما:\n\n";

  services.forEach((s, i) => {

   msg += `🔹 ${s.type}\n`;
   msg += `${s.config}\n\n`;

  });

  return ctx.reply(msg);

 }

 // ================= ADMIN =================

 if (
  text === "⚙️ مدیریت" &&
  userId == config.adminId
 ) {

  return ctx.reply(

`⚙️ مدیریت

ارسال کنید:

add 2GB
add 5GB
add 10GB
add FREE`

  );

 }

 // ================= ADD MODE =================

 if (
  userId == config.adminId &&
  text.startsWith("add ")
 ) {

  adminMode = true;

  adminType =
   text.replace("add ", "").trim();

  return ctx.reply(

`کانفیگ‌ها را ارسال کنید

هر خط = یک کانفیگ

برای پایان:
done`

  );

 }

 // ================= SAVE CONFIGS =================

 if (
  adminMode &&
  userId == config.adminId &&
  text !== "done"
 ) {

  let count = 0;

  text.split("\n").forEach(line => {

   if (
    line.trim().startsWith("vless://")
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
  adminMode &&
  text === "done"
 ) {

  adminMode = false;

  return ctx.reply(
   "✅ پایان افزودن"
  );

 }

 // ================= PLANS =================

 const plans = {

  "2 گیگ - 340 هزار تومان": {
   type: "2GB",
   price: 2
  },

  "5 گیگ - 800 هزار تومان": {
   type: "5GB",
   price: 4
  },

  "10 گیگ - 1500000 تومان": {
   type: "10GB",
   price: 9
  }

 };

 // ================= CREATE PAYMENT =================

 if (plans[text]) {

  if (paymentLinks[userId]) {

   const elapsed =
    (Date.now() - paymentTimes[userId]) /
    1000 / 60;

   if (elapsed < 20) {

    return ctx.reply(

`⚠️ شما لینک فعال دارید

${paymentLinks[userId]}

⏰ اعتبار:
${Math.floor(20 - elapsed)} دقیقه`

    );

   } else {

    delete paymentLinks[userId];
    delete paymentTimes[userId];

   }

  }

  try {

   const plan = plans[text];

   const response = await axios.post(

    "https://api.nowpayments.io/v1/invoice",

    {
     price_amount: plan.price,
     price_currency: "usd",
     order_id:
      `${userId}_${Date.now()}`,
     order_description:
      plan.type,
     ipn_callback_url:
      `${config.domain}/payment-webhook`
    },

    {
     headers: {
      "x-api-key":
       config.nowPaymentsApiKey
     }
    }

   );

   const invoice =
    response.data.invoice_url;

   paymentLinks[userId] = invoice;

   paymentTimes[userId] = Date.now();

   db.setPendingPayment(
    userId,
    plan.type
   );

   return ctx.reply(

`💳 لینک پرداخت ساخته شد

${invoice}

⏰ اعتبار:
20 دقیقه

بعد از پرداخت:
🔄 بررسی پرداخت`

   );

  } catch (e) {

   console.log(e.response?.data || e.message);

   return ctx.reply(
    "❌ خطا در ساخت پرداخت"
   );

  }

 }

 // ================= CHECK PAYMENT =================

 if (text === "🔄 بررسی پرداخت") {

  let pending =
   db.getPendingPayment(userId);

  if (!pending) {

   return ctx.reply(
    "❌ پرداخت فعالی ندارید"
   );

  }

  // تستی:
  // اینجا بعداً میشه verify واقعی زد

  let configItem =
   db.getUnusedConfig(
    pending.plan
   );

  if (!configItem) {

   return ctx.reply(
    "❌ کانفیگ موجود نیست"
   );

  }

  db.useConfig(configItem.id);

  db.addPurchase(
   userId,
   pending.plan,
   configItem.config
  );

  db.clearPendingPayment(userId);

  delete paymentLinks[userId];
  delete paymentTimes[userId];

  return ctx.reply(

`✅ پرداخت تایید شد

📦 کانفیگ شما:

${configItem.config}`

  );

 }

});

// ================= SERVER =================

app.get("/", (req, res) => {
 res.send("Bot Running");
});

const PORT =
 process.env.PORT || 3000;

app.listen(PORT, () => {
 console.log("Server Running");
});

// ================= BOT =================

bot.start();

console.log("Bot Started");
