const BOT_ACTIVE = false;
if (!BOT_ACTIVE) return;
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
const replyMode = {};
const processedTx = new Set();

// ================= TON WALLET =================

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

// ================= START (UNCHANGED) =================

bot.command("start", async (ctx) => {
 const userId = ctx.from.id;

 db.createUser(
  userId,
  ctx.from.username || "unknown",
  ctx.from.first_name || "User"
 );

 await ctx.reply(
`سلام و درود به ربات VPN Mirza

🔸 سرویس ها نامحدود
🔹 پرداخت TON فعال`
 ,
 { reply_markup: mainKeyboard(userId) }
 );
});

// ================= MESSAGE (UNCHANGED FEATURES) =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // BUY
 if (text === "🔐 خرید اشتراک") {

  const kb = new InlineKeyboard()
   .text("2 گیگ - 1.28 TON", "buy_2")
   .row()
   .text("5 گیگ - 2.14 TON", "buy_5")
   .row()
   .text("10 گیگ - 4.45 TON", "buy_10");

  return ctx.reply("📦 انتخاب پلن", { reply_markup: kb });
 }

 // TICKET (UNCHANGED)
 if (text === "🎫 ارسال تیکت") {
  ticketMode[userId] = true;
  return ctx.reply("✍️ پیام خود را ارسال کنید");
 }

 if (ticketMode[userId]) {
  delete ticketMode[userId];

  await bot.api.sendMessage(
   config.adminId,
   `🎫 تیکت جدید\n👤 ${userId}\n\n${text}`,
   {
    reply_markup: {
     inline_keyboard: [
      [{ text: "💬 پاسخ", callback_data: `reply_${userId}` }]
     ]
    }
   }
  );

  return ctx.reply("✅ ارسال شد");
 }

});

// ================= PAYMENT (ONLY FIXED PART) =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId])
  return ctx.reply("⚠️ پرداخت فعال دارید");

 const orderId = `${userId}_${Date.now()}`;

 const tonAmount = Number(plan.price);

 const payUrl =
 `https://app.tonkeeper.com/transfer/${TON_WALLET}?amount=${Math.floor(tonAmount * 1e9)}&text=${orderId}`;

 activePayments[userId] = {
  orderId,
  plan: plan.type,
  amount: tonAmount,
  time: Date.now()
 };

 setTimeout(() => {
  if (activePayments[userId]) {
   delete activePayments[userId];
   bot.api.sendMessage(userId, "⌛ پرداخت منقضی شد");
  }
 }, 20 * 60 * 1000);

 const kb = new InlineKeyboard()
  .url("💰 پرداخت TON", payUrl)
  .text("❌ لغو", "cancel_payment");

 return ctx.reply(
`💳 پرداخت ${plan.type}

⏳ اعتبار: 20 دقیقه`,
 { reply_markup: kb }
 );
}

// ================= TON CHECKER (REAL) =================

async function checkTON() {

 try {

  const res = await axios.get(
   `https://tonapi.io/v2/blockchain/accounts/${TON_WALLET}/transactions?limit=20`
  );

  const txs = res.data.transactions || [];

  for (const userId in activePayments) {

   const p = activePayments[userId];

   for (const tx of txs) {

    const hash = tx.hash;
    if (processedTx.has(hash)) continue;

    const value = Number(tx.in_msg?.value || 0) / 1e9;
    const comment = tx.in_msg?.message || "";

    if (
     value >= p.amount &&
     comment.includes(p.orderId)
    ) {

     processedTx.add(hash);

     const cfg = db.getConfig(p.plan);
     if (!cfg) return;

     db.useConfig(cfg.id);
     db.addPurchase(userId, p.plan, cfg.config);

     delete activePayments[userId];

     await bot.api.sendMessage(
      Number(userId),
      `✅ پرداخت تایید شد\n\n📦 کانفیگ:\n${cfg.config}`
     );

     try {
      const qr = await QRCode.toBuffer(cfg.config);
      await bot.api.sendPhoto(Number(userId), { source: qr });
     } catch {}

    }

   }

  }

 } catch (e) {
  console.log("TON ERROR", e.message);
 }

}

setInterval(checkTON, 15000);

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;

 const plans = {
  buy_2: { type: "2GB", price: 1.28 },
  buy_5: { type: "5GB", price: 2.14 },
  buy_10: { type: "10GB", price: 4.45 }
 };

 if (plans[data]) {
  return createPayment(ctx, plans[data]);
 }

 if (data === "cancel_payment") {

  const p = activePayments[ctx.from.id];

  if (!p) return ctx.reply("❌ پرداختی ندارید");

  delete activePayments[ctx.from.id];

  return ctx.editMessageText("❌ پرداخت لغو شد");
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
