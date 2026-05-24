const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= STATE =================

const payments = {};
const tickets = {};

let adminMode = false;
let adminType = "";

// فقط برای ریپلای تیکت
let replyMode = false;
let replyUserId = null;

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

🔸 زمان سرویس ها نامحدود هست
🔹 تعداد کاربر سرویس ها نامحدود هست
🔸 تیم وی پی ان میرزا`

 ,
 {
  reply_markup: mainKeyboard(userId)
 });

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  tickets[userId] = true;

  return ctx.reply(
`✍️ پیام خود را بنویسید

برای لغو:
/cancel`
  );

 }

 if (text === "/cancel") {

  delete tickets[userId];

  return ctx.reply("❌ لغو شد");

 }

 // کاربر در حال ارسال تیکت
 if (tickets[userId]) {

  delete tickets[userId];

  const sent = await bot.api.sendMessage(

   config.adminId,

`🎫 تیکت جدید

👤 User ID: ${userId}

📩 پیام:
${text}`,

   {
    reply_markup: {
     inline_keyboard: [
      [
       {
        text: "💬 پاسخ به تیکت",
        callback_data: `reply_${userId}`
       }
      ]
     ]
    }
   }

  );

  return ctx.reply("✅ تیکت ارسال شد");

 }

 // ================= ADMIN REPLY =================

 if (userId == config.adminId && replyMode) {

  await bot.api.sendMessage(
   replyUserId,
   `📩 پاسخ پشتیبانی:

${text}`
  );

  replyMode = false;
  replyUserId = null;

  return ctx.reply("✅ پاسخ ارسال شد");

 }

 // ================= BUY =================

 if (text === "🔐 خرید اشتراک") {

  const keyboard = new InlineKeyboard()
   .text("2 گیگ - 340,000 تومان", "buy_2").row()
   .text("5 گیگ - 800,000 تومان", "buy_5").row()
   .text("10 گیگ - 1,500,000 تومان", "buy_10").row()
   .text("🔙 بازگشت", "back");

  return ctx.reply("📦 انتخاب پلن:", {
   reply_markup: keyboard
  });

 }

 // ================= MY SERVICES =================

 if (text === "🛍 سرویس‌های من") {

  const services = db.getPurchases(userId);

  if (!services.length) return ctx.reply("❌ سرویسی ندارید");

  let msg = "📦 سرویس‌های شما:\n\n";

  services.forEach(s => {
   msg += `🔹 ${s.type}\n${s.config}\n\n`;
  });

  return ctx.reply(msg);

 }

 // ================= FREE TEST =================

 if (text === "🎁 تست رایگان") {

  const user = db.getUser(userId);

  if (user?.hasFreeTest) return ctx.reply("❌ قبلاً استفاده شده");

  const cfg = db.getUnusedConfig("FREE");

  if (!cfg) return ctx.reply("❌ تست موجود نیست");

  db.useConfig(cfg.id);
  db.setFreeTestUsed(userId);
  db.addPurchase(userId, "20MB TEST", cfg.config);

  return ctx.reply(`🎁 تست:\n\n${cfg.config}`);
 }

 // ================= ADMIN =================

 if (text === "⚙️ مدیریت" && userId == config.adminId) {
  return ctx.reply(`add 2GB\nadd 5GB\nadd FREE`);
 }

 if (text.startsWith("add ") && userId == config.adminId) {

  adminMode = true;
  adminType = text.replace("add ", "");

  return ctx.reply("کانفیگ‌ها را بفرست (done برای پایان)");
 }

 if (adminMode && userId == config.adminId && text !== "done") {

  let count = 0;

  text.split("\n").forEach(l => {
   if (l.startsWith("vless://")) {
    db.addConfig(adminType, l.trim());
    count++;
   }
  });

  return ctx.reply(`✅ ${count} کانفیگ ذخیره شد`);
 }

 if (text === "done" && userId == config.adminId) {
  adminMode = false;
  return ctx.reply("✅ پایان");
 }

});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 // BUY PLANS
 const plans = {
  buy_2: { type: "2GB", price: 2 },
  buy_5: { type: "5GB", price: 4 },
  buy_10: { type: "10GB", price: 8 }
 };

 // BACK
 if (data === "back") return ctx.deleteMessage();

 // ================= REPLY TICKET =================

 if (data.startsWith("reply_") && userId == config.adminId) {

  replyUserId = data.split("_")[1];
  replyMode = true;

  return ctx.reply("✍️ پاسخ را بنویسید");
 }

 if (!plans[data]) return;

 try {

  const plan = plans[data];

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
   time: Date.now()
  };

  return ctx.reply(`💳 لینک پرداخت:\n\n${url}`);

 } catch (e) {

  return ctx.reply("❌ خطا در پرداخت");

 }

});

// ================= SERVER =================

app.get("/", (req, res) => res.send("BOT RUNNING"));

app.listen(process.env.PORT || 3000);

bot.start();

console.log("Bot Started");
