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
  ]
 ]).resized();
}

// ================= START =================

bot.command("start", async (ctx) => {
 await ctx.reply("سلام 👋", {
  reply_markup: mainKeyboard(ctx.from.id)
 });
});

// ================= CREATE PAYMENT =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId]) {
  return ctx.reply("⚠️ پرداخت فعال دارید");
 }

 const orderId = `${userId}_${Date.now()}`;

 const tonAmount = plan.price;

 const payUrl =
 `https://app.tonkeeper.com/transfer/${TON_WALLET}?amount=${Math.floor(tonAmount * 1e9)}&text=${orderId}`;

 activePayments[userId] = {
  orderId,
  plan: plan.type,
  amount: tonAmount,
  created: Date.now()
 };

 // تایمر 20 دقیقه‌ای
 setTimeout(() => {
  if (activePayments[userId]) {
   delete activePayments[userId];
   bot.api.sendMessage(userId, "⌛ پرداخت منقضی شد");
  }
 }, 20 * 60 * 1000);

 const kb = new InlineKeyboard()
  .url("💰 پرداخت TON", payUrl);

 ctx.reply(`💳 پرداخت ${plan.type}\n⏳ 20 دقیقه فرصت دارید`);

}

// ================= TON CHECKER =================

async function checkPayments() {

 try {

  if (!Object.keys(activePayments).length) return;

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

     if (!cfg) continue;

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
  console.log("TON CHECK ERROR:", e.message);
 }

}

// هر 15 ثانیه چک کن
setInterval(checkPayments, 15000);

// ================= BUY HANDLER =================

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

});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));
app.listen(3000);

bot.start();
console.log("Bot Started");
