const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= STATE =================

const payments = {}; // active payments

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
`سلام و درود به ربات VPN Mirza خوش آمدید`,
 { reply_markup: mainKeyboard(userId) }
 );

});

// ================= BUY =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 if (text === "🔐 خرید اشتراک") {

  const keyboard = new InlineKeyboard()
   .text("2GB - 340k", "buy_2").row()
   .text("5GB - 800k", "buy_5").row()
   .text("10GB - 1.5M", "buy_10");

  return ctx.reply("📦 انتخاب پلن", {
   reply_markup: keyboard
  });

 }

});

// ================= PAYMENT CREATE =================

async function createPayment(ctx, plan) {

 const userId = ctx.from.id;

 // 🛑 اگر پرداخت فعال داری
 if (payments[userId]) {

  const remain =
   20 - Math.floor((Date.now() - payments[userId].time) / 60000);

  if (remain > 0) {

   return ctx.reply(
`⚠️ شما یک لینک فعال دارید

⏰ ${remain} دقیقه باقی مانده

🔗 ${payments[userId].url}

اگر میخوای لغو بشه بزن:
/cancelpay`
   );
  }

  delete payments[userId];
 }

 try {

  const res = await axios.post(
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

  const url = res.data.invoice_url;

  payments[userId] = {
   url,
   plan: plan.type,
   time: Date.now(),
   timer: setTimeout(async () => {

    if (!payments[userId]) return;

    delete payments[userId];

    await ctx.api.sendMessage(
     userId,
     "⌛ لینک پرداخت شما منقضی شد"
    );

   }, 20 * 60 * 1000)
  };

  return ctx.reply(
`💳 لینک پرداخت:

${url}

⏰ اعتبار: 20 دقیقه`
  );

 } catch (e) {
  return ctx.reply("❌ خطا در پرداخت");
 }

}

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;

 const plans = {
  buy_2: { type: "2GB", price: 2 },
  buy_5: { type: "5GB", price: 4 },
  buy_10: { type: "10GB", price: 8 }
 };

 const userId = ctx.from.id;

 if (!plans[data]) return;

 // ارسال به createPayment
 return createPayment(ctx, plans[data]);

});

// ================= CANCEL PAYMENT =================

bot.command("cancelpay", async (ctx) => {

 const userId = ctx.from.id;

 if (!payments[userId]) {
  return ctx.reply("❌ پرداختی وجود ندارد");
 }

 clearTimeout(payments[userId].timer);

 delete payments[userId];

 return ctx.reply("❌ لینک پرداخت لغو شد");
});

// ================= NOWPAYMENTS WEBHOOK =================
// وقتی پرداخت انجام شد

app.post("/webhook", async (req, res) => {

 try {

  const body = req.body;

  const orderId = body.order_id;

  const userId = Number(orderId.split("_")[0]);

  if (!userId) return res.sendStatus(200);

  const payment = payments[userId];

  if (!payment) return res.sendStatus(200);

  // گرفتن کانفیگ
  const cfg = db.getUnusedConfig(payment.plan);

  if (!cfg) return res.sendStatus(200);

  db.useConfig(cfg.id);
  db.addPurchase(userId, payment.plan, cfg.config);

  delete payments[userId];

  await bot.api.sendMessage(
   userId,
   `✅ پرداخت موفق

📦 کانفیگ شما:

${cfg.config}`
  );

 } catch (e) {
  console.log(e);
 }

 res.sendStatus(200);
});

// ================= SERVER =================

app.get("/", (req, res) => {
 res.send("BOT RUNNING");
});

app.listen(process.env.PORT || 3000);

bot.start();

console.log("Bot Started");
