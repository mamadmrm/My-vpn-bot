const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= TON WALLET =================

const TON_WALLET =
 "UQAEL_3zGqytXFChxbdnZq7OfIi0ofFZ43QSHUJpWatQzCqV";

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
🔹 سرویس ها پایدار هستند
🔸 پرداخت با TON فعال شده`
 ,
 { reply_markup: mainKeyboard(userId) }
 );

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

  return ctx.reply("پلن را انتخاب کنید", {
   reply_markup: kb
  });
 }

 // ================= SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length)
   return ctx.reply("سرویسی ندارید");

  for (const s of services) {

   await ctx.reply(
`📦 ${s.type}

${s.config}

⏳ انقضا: ${
 s.expireAt
  ? new Date(s.expireAt).toLocaleString()
  : "نامحدود"
}`
   );

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
   return ctx.reply("قبلاً استفاده شده");

  const cfg = db.getConfig("FREE");

  if (!cfg)
   return ctx.reply("تست موجود نیست");

  db.useConfig(cfg.id);
  db.setFreeUsed(userId);

  const expireAt = Date.now() + 1 * 60 * 60 * 1000;

  db.addPurchase(userId, "FREE TEST", cfg.config, expireAt);

  return ctx.reply(`🎁 تست فعال شد`);
 }

});

// ================= TON PAYMENT =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId])
  return ctx.reply("⚠️ پرداخت فعال داری");

 const orderId = `${userId}_${Date.now()}`;

 // TON conversion (simple fixed rate)
 const tonAmount =
  plan.price; // فرض: قیمت به TON تعریف شده

 const payUrl =
`https://tonkeeper.com/transfer/${TON_WALLET}?amount=${tonAmount * 1e9}&text=${orderId}`;

 activePayments[userId] = {
  orderId,
  plan: plan.type,
  timer: setTimeout(() => {
   delete activePayments[userId];
   bot.api.sendMessage(userId, "⌛ پرداخت منقضی شد");
  }, 20 * 60 * 1000)
 };

 const kb = new InlineKeyboard()
  .url("💰 پرداخت با TON", payUrl)
  .text("❌ لغو", "cancel_payment");

 return ctx.reply(
`💳 پرداخت TON

💰 پلن: ${plan.type}
⏳ 20 دقیقه اعتبار`
 ,
 { reply_markup: kb }
 );

}

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 const plans = {
  buy_2: { type: "2GB", price: 0.5 },
  buy_5: { type: "5GB", price: 1 },
  buy_10: { type: "10GB", price: 2 }
 };

 if (plans[data]) {
  return createPayment(ctx, plans[data]);
 }

 if (data === "cancel_payment") {

  if (activePayments[userId]) {
   clearTimeout(activePayments[userId].timer);
   delete activePayments[userId];
  }

  return ctx.reply("❌ پرداخت لغو شد");
 }

});

// ================= AUTO EXPIRE SYSTEM =================

setInterval(() => {

 const now = Date.now();

 const users = db.getAllPurchases();

 users.forEach(u => {

  if (u.expireAt && u.expireAt < now) {

   db.disableConfig(u.config);

   bot.api.sendMessage(
    u.userId,
    "⛔ اشتراک شما منقضی شد"
   );

  }

 });

}, 60 * 1000);

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));

app.listen(3000);

bot.start();
console.log("BOT RUNNING");
