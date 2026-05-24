const { Bot, Keyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

const payments = {};
const tickets = {};

// ================= KEYBOARDS =================

function mainKeyboard(userId) {

 return Keyboard.from([

  [{ text: "🛒 خرید اشتراک" }],

  [{ text: "📦 سرویس‌های من" }, { text: "🎁 تست رایگان" }],

  [{ text: "🎫 ارسال تیکت" }],

  ...(userId == config.adminId
   ? [[{ text: "⚙️ مدیریت" }]]
   : [])

 ]).resized();

}

function planKeyboard() {

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

// ================= ADMIN =================

let adminMode = false;
let adminType = "";

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BUY =================

 if (text === "🛒 خرید اشتراک") {

  return ctx.reply("پلن را انتخاب کنید:", {
   reply_markup: planKeyboard()
  });

 }

 // ================= BACK =================

 if (text === "🔙 بازگشت") {

  return ctx.reply("منوی اصلی", {
   reply_markup: mainKeyboard(userId)
  });

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
   "✅ تیکت شما ارسال شد"
  );

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user && user.hasFreeTest) {

   return ctx.reply("❌ قبلاً تست رایگان گرفته‌اید");

  }

  const cfg = db.getUnusedConfig("FREE");

  if (!cfg) {

   return ctx.reply("❌ کانفیگ تست موجود نیست");

  }

  db.useConfig(cfg.id);

  db.setFreeTestUsed(userId);

  db.addPurchase(userId, "20MB TEST", cfg.config);

  return ctx.reply(`🎁 تست رایگان:\n\n${cfg.config}`);

 }

 // ================= MY SERVICES =================

 if (text === "📦 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length) {

   return ctx.reply("❌ سرویسی ندارید");

  }

  let msg = "📦 سرویس‌های شما:\n\n";

  services.forEach((s) => {

   msg += `🔹 ${s.type}\n${s.config}\n\n`;

  });

  return ctx.reply(msg);

 }

 // ================= ADMIN PANEL =================

 if (text === "⚙️ مدیریت" && userId == config.adminId) {

  return ctx.reply(

`ارسال کنید:

add 2GB
add 5GB
add 10GB
add FREE`

  );

 }

 // ================= ADD MODE =================

 if (text.startsWith("add ") && userId == config.adminId) {

  adminMode = true;

  adminType = text.replace("add ", "").trim();

  return ctx.reply(
"کانفیگ‌ها را بفرست\nهر خط = یک کانفیگ\n\nبرای پایان: done"
  );

 }

 // ================= SAVE CONFIG =================

 if (adminMode && userId == config.adminId && text !== "done") {

  let count = 0;

  text.split("\n").forEach(line => {

   if (line.startsWith("vless://")) {

    db.addConfig(adminType, line.trim());

    count++;

   }

  });

  return ctx.reply(`✅ ${count} کانفیگ ذخیره شد`);

 }

 if (text === "done") {

  adminMode = false;

  return ctx.reply("✅ پایان");

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

  if (payments[userId]) {

   const remain =
    20 - Math.floor(
     (Date.now() - payments[userId].time)
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

  try {

   const plan = plans[text];

   const response = await axios.post(

    "https://api.nowpayments.io/v1/invoice",

    {
     price_amount: plan.price,
     price_currency: "usd",
     order_id: `${userId}_${Date.now()}`,
     order_description: plan.type
    },

    {
     headers: {
      "x-api-key": config.nowPaymentsApiKey
     }
    }

   );

   const url = response.data.invoice_url;

   payments[userId] = {

    url,
    plan: plan.type,
    time: Date.now()

   };

   db.setPendingPayment(userId, plan.type);

   // ================= AUTO EXPIRE =================

   setTimeout(async () => {

    if (!payments[userId]) return;

    const elapsed =
     (Date.now() - payments[userId].time)
     / 60000;

    if (elapsed >= 20) {

     delete payments[userId];

     db.clearPendingPayment(userId);

     try {

      await bot.api.sendMessage(
       userId,
       "⌛ لینک پرداخت منقضی شد"
      );

     } catch {}

    }

   }, 20 * 60 * 1000);

   return ctx.reply(

`💳 لینک پرداخت:

${url}

⏰ اعتبار:
20 دقیقه

بعد پرداخت بزن:
🔄 بررسی پرداخت`

   );

  } catch (e) {

   console.log(e.response?.data || e.message);

   return ctx.reply(
    "❌ خطا در ساخت لینک پرداخت"
   );

  }

 }

 // ================= CHECK PAYMENT =================

 if (text === "🔄 بررسی پرداخت") {

  const pending =
   db.getPendingPayment(userId);

  if (!pending) {

   return ctx.reply("❌ پرداختی ندارید");

  }

  const cfg =
   db.getUnusedConfig(pending.plan);

  if (!cfg) {

   return ctx.reply("❌ کانفیگ موجود نیست");

  }

  db.useConfig(cfg.id);

  db.addPurchase(
   userId,
   pending.plan,
   cfg.config
  );

  db.clearPendingPayment(userId);

  delete payments[userId];

  return ctx.reply(

`✅ کانفیگ شما:

${cfg.config}`

  );

 }

});

// ================= SERVER =================

app.get("/", (req, res) => {
 res.send("BOT RUNNING");
});

const PORT =
 process.env.PORT || 3000;

app.listen(PORT, () => {
 console.log("Server Started");
});

// ================= BOT =================

bot.start();

console.log("Bot Started");
