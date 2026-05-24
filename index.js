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

🔸 سرویس‌ها نامحدود
🔹 کیفیت پایدار
🔸 تلاش برای اتصال دائمی کاربران`
 ,
 {
  reply_markup: mainKeyboard(userId)
 });

});

// ================= BUY MENU =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 if (text === "🔐 خرید اشتراک") {

  const kb = new InlineKeyboard()
   .text("2 گیگ - 340 هزار تومان", "buy_2").row()
   .text("5 گیگ - 800 هزار تومان", "buy_5").row()
   .text("10 گیگ - 1,500,000 تومان", "buy_10");

  return ctx.reply("پلن را انتخاب کنید:", { reply_markup: kb });
 }

 // ================= SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length)
   return ctx.reply("سرویسی ندارید");

  for (const s of services) {
   await ctx.reply(`📦 ${s.type}\n\n${s.config}`);
  }
 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user.free_used)
   return ctx.reply("قبلاً استفاده شده");

  const cfg = db.getConfig("FREE");

  if (!cfg)
   return ctx.reply("تستی موجود نیست");

  db.useConfig(cfg.id);
  db.setFreeUsed(userId);

  db.addPurchase(userId, "TEST 20MB", cfg.config);

  return ctx.reply(`🎁 تست:\n\n${cfg.config}`);
 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {
  ticketMode[userId] = true;
  return ctx.reply("پیام خود را ارسال کنید:");
 }

 if (ticketMode[userId]) {

  delete ticketMode[userId];

  await bot.api.sendMessage(
   config.adminId,
   `🎫 تیکت\n\n👤 ${userId}\n\n${text}`,
   {
    reply_markup: {
     inline_keyboard: [[
      { text: "پاسخ", callback_data: `reply_${userId}` }
     ]]
    }
   }
  );

  return ctx.reply("ارسال شد");
 }

 // ================= ADMIN PANEL =================

 if (text === "⚙️ مدیریت" && userId == config.adminId) {

  const kb = new InlineKeyboard()

   .text("➕ شارژ 2GB", "add_2").text("➕ شارژ 5GB", "add_5").row()
   .text("➕ شارژ 10GB", "add_10").text("🎁 شارژ تست", "add_free").row()
   .text("📊 آمار", "stats");

  return ctx.reply("پنل مدیریت:", { reply_markup: kb });
 }

 // ================= ADD MODE =================

 if (adminMode[userId]) {

  if (text === "done") {
   delete adminMode[userId];
   return ctx.reply("تمام شد");
  }

  let count = 0;

  text.split("\n").forEach(line => {
   if (line.startsWith("vless://")) {
    db.addConfig(adminMode[userId], line);
    count++;
   }
  });

  return ctx.reply(`${count} کانفیگ اضافه شد`);
 }

});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 // ================= ADMIN ADD =================

 if (userId == config.adminId) {

  if (data === "add_2") {
   adminMode[userId] = "2GB";
   return ctx.reply("کانفیگ 2GB بفرست");
  }

  if (data === "add_5") {
   adminMode[userId] = "5GB";
   return ctx.reply("کانفیگ 5GB بفرست");
  }

  if (data === "add_10") {
   adminMode[userId] = "10GB";
   return ctx.reply("کانفیگ 10GB بفرست");
  }

  if (data === "add_free") {
   adminMode[userId] = "FREE";
   return ctx.reply("کانفیگ تست بفرست");
  }

  if (data === "stats") {

   return ctx.reply(
`📊 آمار

2GB: ${db.getConfigsCount("2GB")}
5GB: ${db.getConfigsCount("5GB")}
10GB: ${db.getConfigsCount("10GB")}
FREE: ${db.getConfigsCount("FREE")}`
   );

  }
 }

 // ================= PAYMENT =================

 const plans = {
  buy_2: { type: "2GB", price: 2 },
  buy_5: { type: "5GB", price: 4 },
  buy_10: { type: "10GB", price: 8 }
 };

 if (!plans[data]) return;

 if (activePayments[userId]) {
  return ctx.reply("اول پرداخت قبلی را لغو کن");
 }

 const res = await axios.post(
  "https://api.nowpayments.io/v1/invoice",
  {
   price_amount: plans[data].price,
   price_currency: "usd",
   order_id: `${userId}_${Date.now()}`,
   order_description: plans[data].type
  },
  {
   headers: {
    "x-api-key": config.nowPaymentsApiKey
   }
  }
 );

 const url = res.data.invoice_url;

 activePayments[userId] = {
  url,
  plan: plans[data].type,
  timer: setTimeout(async () => {

   delete activePayments[userId];

   try {
    await bot.api.sendMessage(userId, "⌛ پرداخت منقضی شد");
   } catch {}

  }, 20 * 60 * 1000)
 };

 const kb = new InlineKeyboard()
  .url("💳 پرداخت", url).row()
  .text("❌ لغو", "cancel");

 return ctx.reply(
  "لینک پرداخت ساخته شد",
  { reply_markup: kb }
 );

});

// ================= CANCEL =================

bot.on("callback_query:data", async (ctx) => {

 const userId = ctx.from.id;
 const data = ctx.callbackQuery.data;

 if (data === "cancel") {

  if (!activePayments[userId])
   return ctx.reply("نداری");

  clearTimeout(activePayments[userId].timer);
  delete activePayments[userId];

  return ctx.reply("لغو شد");
 }

 if (data.startsWith("reply_")) {
  replyMode[config.adminId] = data.split("_")[1];
  return ctx.reply("پاسخ را بنویس");
 }

});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));

app.listen(3000, () => console.log("RUNNING"));

bot.start();
