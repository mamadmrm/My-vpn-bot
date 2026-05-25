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
🔹 تعداد کاربر نامحدود هست
🔸 پرداخت TON فعال`
 ,
 { reply_markup: mainKeyboard(userId) }
 );

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // BUY MENU
 if (text === "🔐 خرید اشتراک") {

  const kb = new InlineKeyboard()
   .text("2 گیگ - 340 هزار تومان", "buy_2")
   .row()
   .text("5 گیگ - 800 هزار تومان", "buy_5")
   .row()
   .text("10 گیگ - 1,500,000 تومان", "buy_10");

  return ctx.reply("📦 پلن را انتخاب کنید", {
   reply_markup: kb
  });
 }

 // SERVICES
 if (text === "🛍 سرویس‌های من") {

  const list = db.getPurchases(userId);

  if (!list || !list.length)
   return ctx.reply("❌ سرویسی ندارید");

  for (const s of list) {

   await ctx.reply(
`📦 ${s.type}

${s.config}
`
   );

   try {
    const qr = await QRCode.toBuffer(s.config);
    await ctx.replyWithPhoto({ source: qr });
   } catch {}
  }
 }

 // FREE TEST
 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user?.free_used)
   return ctx.reply("❌ قبلاً تست گرفته‌اید");

  const cfg = db.getConfig("FREE");

  if (!cfg)
   return ctx.reply("❌ کانفیگ موجود نیست");

  db.useConfig(cfg.id);
  db.setFreeUsed(userId);

  db.addPurchase(userId, "FREE TEST", cfg.config);

  return ctx.reply("🎁 تست فعال شد");
 }

 // TICKET
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

  return ctx.reply("✅ ارسال شد");
 }

 // ADMIN PANEL
 if (text === "⚙️ مدیریت کانفیگ" && userId == config.adminId) {

  return ctx.reply(
`⚙️ پنل مدیریت

add 2GB
add 5GB
add 10GB
add FREE`
  );
 }

 // ADD CONFIG
 if (text.startsWith("add ") && userId == config.adminId) {

  adminMode[userId] = text.replace("add ", "");
  return ctx.reply("📥 کانفیگ‌ها را ارسال کنید");
 }

 if (adminMode[userId] && userId == config.adminId) {

  if (text === "done") {
   delete adminMode[userId];
   return ctx.reply("✅ پایان");
  }

  let count = 0;

  text.split("\n").forEach(line => {
   if (line.startsWith("vless://")) {
    db.addConfig(adminMode[userId], line.trim());
    count++;
  }
  });

  return ctx.reply(`✅ ${count} کانفیگ اضافه شد`);
 }

});

// ================= TON PAYMENT (FIXED SAFE) =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 if (activePayments[userId])
  return ctx.reply("⚠️ پرداخت فعال داری");

 const orderId = `${userId}_${Date.now()}`;

 // جلوگیری از NaN / crash
 const tonAmount = Number(plan.price || 1);

 const payUrl =
 `https://app.tonkeeper.com/transfer/${TON_WALLET}?amount=${Math.floor(tonAmount * 1e9)}&text=${orderId}`;

 activePayments[userId] = {
  orderId,
  plan: plan.type,
  timer: setTimeout(async () => {

   delete activePayments[userId];

   try {
    await bot.api.sendMessage(userId, "⌛ لینک پرداخت منقضی شد");
   } catch {}

  }, 20 * 60 * 1000)
 };

 const kb = new InlineKeyboard()
  .url("💰 پرداخت با TON", payUrl)
  .row()
  .text("❌ لغو", "cancel_payment");

 return ctx.reply(
`💳 پرداخت TON

⏰ اعتبار: 20 دقیقه`,
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

 if (plans[data])
  return createPayment(ctx, plans[data]);

 if (data === "cancel_payment") {

  if (activePayments[userId]) {
   clearTimeout(activePayments[userId].timer);
   delete activePayments[userId];
  }

  return ctx.reply("❌ پرداخت لغو شد");
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
