const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= WALLET =================

const TON_WALLET =
 "UQAEL_3zGqytXFChxbdnZq7OfIi0ofFZ43QSHUJpWatQzCqV";

// ================= STATE =================

const activePayments = {};
const ticketMode = {};
const adminMode = {};
const replyMode = {};

// ================= MAIN MENU =================

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
`سلام به VPN Mirza

🔹 سرویس‌ها نامحدود
🔹 اتصال پایدار
🔹 پرداخت با TON`
 ,
 { reply_markup: mainKeyboard(userId) }
 );

});

// ================= BUY =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 if (text === "🔐 خرید اشتراک") {

  const kb = new InlineKeyboard()
   .text("2 گیگ - 340K", "buy_2").row()
   .text("5 گیگ - 800K", "buy_5").row()
   .text("10 گیگ - 1.5M", "buy_10");

  return ctx.reply("پلن را انتخاب کنید", {
   reply_markup: kb
  });
 }

 // ================= SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length)
   return ctx.reply("نداری");

  for (const s of services) {
   await ctx.reply(
`📦 ${s.type}

${s.config}

⏳ انقضا: ${new Date(s.expireAt || 0).toLocaleString()}`
   );
  }
 }

 // ================= FREE =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user.free_used)
   return ctx.reply("قبلاً گرفتی");

  const cfg = db.getConfig("FREE");

  db.useConfig(cfg.id);
  db.setFreeUsed(userId);

  const expireAt = Date.now() + 1 * 60 * 60 * 1000;

  db.addPurchase(userId, "TEST", cfg.config, expireAt);

  return ctx.reply("تست فعال شد");
 }

});

// ================= PAYMENT (TON REAL) =================

async function createTonInvoice(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId])
  return ctx.reply("پرداخت فعال داری");

 const orderId = `${userId}_${Date.now()}`;

 const tonAmount =
  plan.price; // TON مستقیم

 const paymentLink =
`https://tonkeeper.com/transfer/${TON_WALLET}?amount=${tonAmount * 1e9}&text=${orderId}`;

 activePayments[userId] = {
  orderId,
  plan: plan.type,
  amount: tonAmount,
  paid: false,
  timer: setTimeout(() => {
   delete activePayments[userId];
   bot.api.sendMessage(userId, "⌛ پرداخت منقضی شد");
  }, 20 * 60 * 1000)
 };

 const kb = new InlineKeyboard()
  .url("💰 پرداخت با TON", paymentLink)
  .text("✅ بررسی پرداخت", `check_${orderId}`)
  .row()
  .text("❌ لغو", "cancel_payment");

 return ctx.reply(
`💳 پرداخت TON

💰 مقدار: ${tonAmount} TON
⏳ 20 دقیقه اعتبار`
  ,
  { reply_markup: kb }
 );

}

// ================= CHECK PAYMENT =================

async function checkPayment(userId, orderId) {

 try {

  const res = await axios.get(
   `https://toncenter.com/api/v2/getTransactions?address=${TON_WALLET}&limit=10`
  );

  const txs = res.data.result;

  const payment = activePayments[userId];

  if (!payment)
   return false;

  const found = txs.find(t =>
   t.in_msg?.message === orderId
  );

  return !!found;

 } catch {
  return false;
 }

}

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 const plans = {
  buy_2: { type: "2GB", price: 2 },
  buy_5: { type: "5GB", price: 5 },
  buy_10: { type: "10GB", price: 10 }
 };

 // ================= BUY =================

 if (plans[data]) {
  return createTonInvoice(ctx, plans[data]);
 }

 // ================= CHECK PAYMENT =================

 if (data.startsWith("check_")) {

  const orderId = data.split("_")[1];

  const ok = await checkPayment(userId, orderId);

  if (!ok)
   return ctx.reply("❌ هنوز پرداخت نشده");

  const payment = activePayments[userId];

  if (!payment)
   return ctx.reply("منقضی شده");

  const cfg = db.getConfig(payment.plan);

  const expireAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  db.addPurchase(userId, payment.plan, cfg.config, expireAt);

  clearTimeout(payment.timer);
  delete activePayments[userId];

  return ctx.reply(
`✅ پرداخت تایید شد

📦 کانفیگ:
${cfg.config}`
  );

 }

 // ================= CANCEL =================

 if (data === "cancel_payment") {

  if (activePayments[userId]) {
   clearTimeout(activePayments[userId].timer);
   delete activePayments[userId];
  }

  return ctx.reply("لغو شد");
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
