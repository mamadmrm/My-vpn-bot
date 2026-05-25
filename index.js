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

// ================= WALLET =================

const TON_WALLET =
 "UQAEL_3zGqytXFChxbdnZq7OfIi0ofFZ43QSHUJpWatQzCqV";

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
   ? [[{ text: "⚙️ مدیریت کانفیگ" }]]
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
    await ctx.replyWithPhoto({ source: qr });
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

  db.addPurchase(userId, "20MB TEST", cfg.config);

  await ctx.reply(`🎁 تست رایگان:\n\n${cfg.config}`);

 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  ticketMode[userId] = true;

  return ctx.reply("✍️ پیام خود را ارسال کنید");
 }

 if (ticketMode[userId]) {

  delete ticketMode[userId];

  await bot.api.sendMessage(
   config.adminId,
   `🎫 تیکت جدید\n\n👤 ${userId}\n\n${text}`,
   {
    reply_markup: {
     inline_keyboard: [
      [{ text: "💬 پاسخ", callback_data: `reply_${userId}` }]
     ]
    }
   }
  );

  return ctx.reply("✅ تیکت ارسال شد");
 }

 // ================= ADMIN PANEL =================

 if (text === "⚙️ مدیریت کانفیگ" && userId == config.adminId) {

  return ctx.reply(
`⚙️ پنل مدیریت

add 2GB
add 5GB
add 10GB
add FREE

stats`
  );

 }

 // ================= ADD CONFIG =================

 if (text.startsWith("add ") && userId == config.adminId) {

  adminMode[userId] = text.replace("add ", "");
  return ctx.reply("📥 کانفیگ‌ها را ارسال کنید (done پایان)");

 }

 if (adminMode[userId] && userId == config.adminId) {

  if (text === "done") {
   delete adminMode[userId];
   return ctx.reply("✅ پایان افزودن");
  }

  let count = 0;

  text.split("\n").forEach(line => {
   if (line.startsWith("vless://")) {
    db.addConfig(adminMode[userId], line.trim());
    count++;
   }
  });

  return ctx.reply(`✅ ${count} کانفیگ ذخیره شد`);
 }

});

// ================= PAYMENT (TON FIXED) =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId]) {
  return ctx.reply("⚠️ یک پرداخت فعال دارید");
 }

 const orderId = `${userId}_${Date.now()}`;

 const tonAmount = plan.price;

 // ✅ FIXED TON PAYMENT LINK
 const payUrl =
`https://app.tonkeeper.com/transfer/${TON_WALLET}?amount=${tonAmount * 1e9}&text=${orderId}`;

 activePayments[userId] = {
  url: payUrl,
  plan: plan.type,
  timer: setTimeout(async () => {
   delete activePayments[userId];
   try {
    await bot.api.sendMessage(userId, "⌛ لینک پرداخت منقضی شد");
   } catch {}
  }, 20 * 60 * 1000)
 };

 const keyboard = new InlineKeyboard()
  .url("💰 پرداخت با TON", payUrl)
  .row()
  .text("❌ لغو پرداخت", "cancel_payment");

 return ctx.reply(
`💳 لینک پرداخت ساخته شد

⏰ اعتبار: 20 دقیقه`,
   { reply_markup: keyboard }
 );

}

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 const plans = {
  buy_2: { type: "2GB", price: 2 },
  buy_5: { type: "5GB", price: 4 },
  buy_10: { type: "10GB", price: 8 }
 };

 if (plans[data]) {
  return createPayment(ctx, plans[data]);
 }

 if (data === "cancel_payment") {

  if (!activePayments[userId])
   return ctx.reply("❌ پرداختی ندارید");

  clearTimeout(activePayments[userId].timer);
  delete activePayments[userId];

  try {
   await ctx.editMessageText("❌ پرداخت لغو شد");
  } catch {}

  return ctx.reply("✅ لغو شد");
 }

 if (data.startsWith("reply_")) {
  replyMode[config.adminId] = data.split("_")[1];
  return ctx.reply("✍️ پاسخ را ارسال کنید");
 }

});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));

app.listen(3000);

bot.start();
console.log("Bot Started");
