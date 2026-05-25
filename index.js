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
const adminAddMode = {};

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
   ? [[{ text: "⚙️ مدیریت" }, { text: "➕ افزودن کانفیگ" }]]
   : [])
 ]).resized();
}

// ================= START =================

bot.command("start", async (ctx) => {

 const userId = ctx.from.id;

 db.createUser(userId);

 await ctx.reply(
`سلام و درود به VPN Mirza

🔹 خرید + تست رایگان
🔹 پرداخت TON`
 ,
 { reply_markup: mainKeyboard(userId) }
 );

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BUY =================

 if (text === "🔐 خرید اشتراک") {

  const kb = new InlineKeyboard()
   .text("2GB - 340K", "buy_2").row()
   .text("5GB - 800K", "buy_5").row()
   .text("10GB - 1.5M", "buy_10");

  return ctx.reply("پلن را انتخاب کنید", {
   reply_markup: kb
  });
 }

 // ================= SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const list = db.getPurchases(userId);

  if (!list.length)
   return ctx.reply("نداری");

  for (const s of list) {

   await ctx.reply(
`📦 ${s.type}

${s.config}

⏳ ${s.expireAt ? new Date(s.expireAt).toLocaleString() : "نامحدود"}`
   );

   try {
    const qr = await QRCode.toBuffer(s.config);
    await ctx.replyWithPhoto({ source: qr });
   } catch {}
  }
 }

 // ================= FREE =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user.free_used)
   return ctx.reply("قبلاً استفاده شده");

  const cfg = db.getConfig("FREE");

  db.useConfig(cfg.id);
  db.setFreeUsed(userId);

  const expireAt = Date.now() + 3600 * 1000;

  db.addPurchase(userId, "FREE", cfg.config, expireAt);

  return ctx.reply("🎁 تست فعال شد");
 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  ticketMode[userId] = true;

  return ctx.reply("پیام خود را بنویس:");
 }

 // ================= ADMIN ADD MODE =================

 if (text === "➕ افزودن کانفیگ" && userId == config.adminId) {

  adminAddMode[userId] = true;

  return ctx.reply(
`📥 کانفیگ ارسال کن (هر خط یکی)

برای پایان: done`
  );
 }

 if (adminAddMode[userId] && userId == config.adminId) {

  if (text === "done") {
   delete adminAddMode[userId];
   return ctx.reply("تمام شد");
  }

  let count = 0;

  text.split("\n").forEach(line => {
   if (line.startsWith("vless://")) {
    db.addConfig("FREE", line.trim());
    count++;
   }
  });

  return ctx.reply(`اضافه شد: ${count}`);
 }

 // ================= ADMIN REPLY =================

 if (replyMode[userId]) {

  const target = replyMode[userId];

  delete replyMode[userId];

  await bot.api.sendMessage(
   target,
   `📩 پاسخ تیکت:\n\n${text}`
  );

  return ctx.reply("ارسال شد");
 }

 // ================= SEND TICKET =================

 if (ticketMode[userId]) {

  delete ticketMode[userId];

  await bot.api.sendMessage(
   config.adminId,
   `🎫 تیکت جدید\n\n👤 ${userId}\n\n${text}`,
   {
    reply_markup: {
     inline_keyboard: [
      [{ text: "پاسخ", callback_data: `reply_${userId}` }]
     ]
    }
   }
  );

  return ctx.reply("ارسال شد");
 }

});

// ================= PAYMENT =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId])
  return ctx.reply("پرداخت فعال داری");

 const orderId = `${userId}_${Date.now()}`;

 const tonAmount = plan.price;

 // 🔥 FIXED TON LINK (404 FIX)
 const payUrl =
`https://app.tonkeeper.com/transfer/${TON_WALLET}?amount=${tonAmount * 1e9}&text=${orderId}`;

 activePayments[userId] = {
  orderId,
  plan: plan.type,
  timer: setTimeout(async () => {

   delete activePayments[userId];

   try {
    await bot.api.sendMessage(userId, "⌛ پرداخت منقضی شد");
   } catch {}

  }, 20 * 60 * 1000)
 };

 const kb = new InlineKeyboard()
  .url("💰 پرداخت با TON", payUrl)
  .text("❌ لغو", "cancel_payment");

 return ctx.reply(
`💳 پرداخت TON

⏳ 20 دقیقه اعتبار`,
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

 // BUY
 if (plans[data])
  return createPayment(ctx, plans[data]);

 // CANCEL PAYMENT
 if (data === "cancel_payment") {

  if (activePayments[userId])
   delete activePayments[userId];

  return ctx.reply("لغو شد");
 }

 // TICKET REPLY FIX
 if (data.startsWith("reply_")) {

  const target = data.split("_")[1];

  replyMode[userId] = target;

  return ctx.reply("پاسخ را بنویس");
 }

});

// ================= AUTO EXPIRE =================

setInterval(() => {

 const now = Date.now();

 const all = db.getAllPurchases();

 all.forEach(u => {

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
