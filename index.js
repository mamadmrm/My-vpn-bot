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

// برای پاسخ تیکت
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
🔹 تعداد کاربر نامحدود
🔸 پشتیبانی 24/7`

 ,
 {
  reply_markup: mainKeyboard(userId)
 });

});

// ================= MAIN MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BUY MENU =================

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

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  tickets[userId] = { step: "write" };

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

 // کاربر در حال نوشتن تیکت
 if (tickets[userId]?.step === "write") {

  delete tickets[userId];

  const sent = await bot.api.sendMessage(

   config.adminId,

`🎫 تیکت جدید

👤 ID: ${userId}

📩 پیام:
${text}`,

   {
    reply_markup: {
     inline_keyboard: [
      [{
       text: "💬 پاسخ",
       callback_data: `reply_${userId}`
      }]
     ]
    }
   }

  );

  return ctx.reply("✅ تیکت ارسال شد");

 }

 // ================= ADMIN =================

 if (text === "⚙️ مدیریت" && userId == config.adminId) {

  return ctx.reply(
`پنل مدیریت:

add 2GB
add 5GB
add 10GB
add FREE`
  );

 }

 if (text.startsWith("add ") && userId == config.adminId) {

  adminMode = true;
  adminType = text.replace("add ", "").trim();

  return ctx.reply("کانفیگ‌ها را بفرست (هر خط یک کانفیگ)");

 }

 if (adminMode && userId == config.adminId && text !== "done") {

  let count = 0;

  text.split("\n").forEach(line => {
   if (line.startsWith("vless://")) {
    db.addConfig(adminType, line.trim());
    count++;
   }
  });

  return ctx.reply(`✅ ${count} کانفیگ ذخیره شد`);

 }

 if (text === "done" && userId == config.adminId) {

  adminMode = false;
  return ctx.reply("✅ پایان");

 }

 // ================= REPLY MODE ADMIN =================

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

});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data = ctx.callbackQuery.data;
 const userId = ctx.from.id;

 // BACK
 if (data === "back") {
  return ctx.deleteMessage();
 }

 // BUY
 const plans = {
  buy_2: { type: "2GB", price: 2 },
  buy_5: { type: "5GB", price: 4 },
  buy_10: { type: "10GB", price: 8 }
 };

 if (data.startsWith("reply_") && userId == config.adminId) {

  replyUserId = data.split("_")[1];
  replyMode = true;

  return ctx.reply("✍️ پاسخ را بنویسید");

 }

 // PAYMENT PLACEHOLDER (همون قبلی خودت)
 if (!plans[data]) return;

 const plan = plans[data];

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
   time: Date.now()
  };

  return ctx.reply(`💳 لینک پرداخت:\n\n${url}`);

 } catch (e) {
  return ctx.reply("❌ خطا در پرداخت");
 }

});

// ================= SERVER =================

app.get("/", (req, res) => {
 res.send("BOT RUNNING");
});

app.listen(process.env.PORT || 3000, () => {
 console.log("Server started");
});

bot.start();

console.log("Bot running");
