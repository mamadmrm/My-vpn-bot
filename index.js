const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const QRCode = require("qrcode");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= STATE =================

const ticketMode = {};
const adminMode = {};
const replyMode = {};
const pendingReceipts = {};

let botEnabled = true;

// ================= CARD INFO =================

const CARD_NUMBER = "6221061206262828";
const CARD_NAME = "محمدرضا میرزاآقایی";

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
   ? [
      [{ text: "⚙️ مدیریت کانفیگ" }],
      [{ text: "🟢 روشن کردن ربات" }],
      [{ text: "🔴 خاموش کردن ربات" }]
     ]
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

// ================= BOT OFF CHECK =================

bot.use(async (ctx, next) => {

 const userId = ctx.from?.id;

 if (
  !botEnabled &&
  userId != config.adminId
 ) {

  return ctx.reply(
   "🔴 ربات در حال حاضر خاموش است"
  );

 }

 await next();

});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {

 const text = ctx.message.text;
 const userId = ctx.from.id;

 // ================= BOT CONTROL =================

 if (
  text === "🔴 خاموش کردن ربات"
  &&
  userId == config.adminId
 ) {

  botEnabled = false;

  return ctx.reply(
   "🔴 ربات خاموش شد"
  );

 }

 if (
  text === "🟢 روشن کردن ربات"
  &&
  userId == config.adminId
 ) {

  botEnabled = true;

  return ctx.reply(
   "🟢 ربات روشن شد"
  );

 }

 // ================= BUY =================

 if (text === "🔐 خرید اشتراک") {

  const keyboard = new InlineKeyboard()

   .text(
    "یک ماهه نامحدود OpenVPN - ۵۵۰ هزار تومان",
    "buy_1month"
   )

   .row()

   .text(
    "سه ماهه نامحدود OpenVPN - ۱ میلیون تومان",
    "buy_3month"
   );

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

    await ctx.replyWithPhoto({
     source: qr
    });

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

  db.addPurchase(
   userId,
   "20MB TEST",
   cfg.config
  );

  await ctx.reply(
   `🎁 تست رایگان:\n\n${cfg.config}`
  );

 }

 // ================= TICKET =================

 if (text === "🎫 ارسال تیکت") {

  ticketMode[userId] = true;

  return ctx.reply(
   "✍️ پیام خود را ارسال کنید"
  );

 }

 if (
  ticketMode[userId]
  &&
  userId != config.adminId
 ) {

  delete ticketMode[userId];

  await bot.api.sendMessage(

   config.adminId,

`🎫 تیکت جدید

👤 ${userId}

📩 ${text}`,

   {
    reply_markup: {
     inline_keyboard: [
      [
       {
        text: "💬 پاسخ",
        callback_data: `reply_${userId}`
       }
      ]
     ]
    }
   }

  );

  return ctx.reply(
   "✅ تیکت ارسال شد"
  );

 }

 // ================= ADMIN REPLY =================

 if (
  userId == config.adminId
  &&
  replyMode[userId]
 ) {

  const target =
   replyMode[userId];

  await bot.api.sendMessage(

   target,

`📩 پاسخ پشتیبانی:

${text}`

  );

  delete replyMode[userId];

  return ctx.reply(
   "✅ پاسخ ارسال شد"
  );

 }

 // ================= ADMIN PANEL =================

 if (
  text === "⚙️ مدیریت کانفیگ"
  &&
  userId == config.adminId
 ) {

  return ctx.reply(

`⚙️ پنل مدیریت

📥 افزودن کانفیگ:

add 1MONTH
add 3MONTH
add FREE

📊 آمار:
stats`

  );

 }

 // ================= ADD CONFIG =================

 if (
  text.startsWith("add ")
  &&
  userId == config.adminId
 ) {

  adminMode[userId] =
   text.replace("add ", "");

  return ctx.reply(

`📥 کانفیگ‌ها را ارسال کنید

هر خط = یک کانفیگ

پایان:
done`

  );

 }

 if (
  adminMode[userId]
  &&
  userId == config.adminId
 ) {

  if (text === "done") {

   delete adminMode[userId];

   return ctx.reply(
    "✅ پایان افزودن"
   );

  }

  let count = 0;

  text.split("\n").forEach(line => {

   if (
    line.startsWith("vless://")
    ||
    line.startsWith("ovpn://")
   ) {

    db.addConfig(
     adminMode[userId],
     line.trim()
    );

    count++;

   }

  });

  return ctx.reply(
   `✅ ${count} کانفیگ ذخیره شد`
  );

 }

});

// ================= RECEIVE RECEIPT =================

bot.on("message:photo", async (ctx) => {

 const userId = ctx.from.id;

 if (!pendingReceipts[userId])
  return;

 const type =
  pendingReceipts[userId];

 delete pendingReceipts[userId];

 const photo =
  ctx.message.photo.pop();

 await bot.api.sendPhoto(

  config.adminId,
  photo.file_id,

  {
   caption:

`💳 رسید جدید

👤 کاربر:
${userId}

📦 پلن:
${type}`,

   reply_markup: {
    inline_keyboard: [

     [
      {
       text: "✅ تایید و ارسال سرویس",
       callback_data:
        `approve_${userId}_${type}`
      }
     ]

    ]
   }

  }

 );

 await ctx.reply(
  "✅ رسید ارسال شد و در انتظار تایید است"
 );

});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {

 const data =
  ctx.callbackQuery.data;

 const userId =
  ctx.from.id;

 // ================= APPROVE PAYMENT =================

 if (
  data.startsWith("approve_")
  &&
  userId == config.adminId
 ) {

  const parts =
   data.split("_");

  const target =
   Number(parts[1]);

  const type =
   parts[2];

  const cfg =
   db.getConfig(type);

  if (!cfg) {

   return ctx.reply(
    "❌ کانفیگ موجود نیست"
   );

  }

  db.useConfig(cfg.id);

  db.addPurchase(
   target,
   type,
   cfg.config
  );

  await bot.api.sendMessage(

   target,

`✅ پرداخت شما تایید شد

📦 کانفیگ شما:

${cfg.config}`

  );

  try {

   const qr =
    await QRCode.toBuffer(
     cfg.config
    );

   await bot.api.sendPhoto(
    target,
    { source: qr }
   );

  } catch {}

  return ctx.reply(
   "✅ سرویس ارسال شد"
  );

 }

 // ================= REPLY =================

 if (
  data.startsWith("reply_")
  &&
  userId == config.adminId
 ) {

  const target =
   data.split("_")[1];

  replyMode[userId] =
   target;

  return ctx.reply(
   "✍️ پاسخ را ارسال کنید"
  );

 }

 // ================= BUY =================

 const plans = {

  buy_1month: {
   type: "1MONTH",
   title: "یک ماهه نامحدود OpenVPN",
   price: "۵۵۰,۰۰۰ تومان"
  },

  buy_3month: {
   type: "3MONTH",
   title: "سه ماهه نامحدود OpenVPN",
   price: "۱,۰۰۰,۰۰۰ تومان"
  }

 };

 // ================= PLAN SELECT =================

 if (plans[data]) {

  const plan = plans[data];

  const keyboard =
   new InlineKeyboard()

   .text(
    "📋 کپی شماره کارت",
    "copy_card"
   )

   .row()

   .text(
    "✅ ارسال رسید",
    `receipt_${plan.type}`
   );

  return ctx.reply(

`💳 پرداخت با کارت

📦 ${plan.title}

💰 مبلغ:
${plan.price}

👤 به نام:
${CARD_NAME}

💳 شماره کارت:
\`${CARD_NUMBER}\`

⚠️ بعد از پرداخت روی «ارسال رسید» بزنید`,

   {
    parse_mode: "Markdown",
    reply_markup: keyboard
   }

  );

 }

 // ================= SEND RECEIPT =================

 if (
  data.startsWith("receipt_")
 ) {

  const type =
   data.replace(
    "receipt_",
    ""
   );

  pendingReceipts[userId] =
   type;

  return ctx.reply(
   "📸 لطفاً عکس رسید پرداخت را ارسال کنید"
  );

 }

 // ================= COPY CARD =================

 if (data === "copy_card") {

  return ctx.answerCallbackQuery({
   text: CARD_NUMBER,
   show_alert: true
  });

 }

});

// ================= SERVER =================

app.get("/", (req, res) => {

 res.send("BOT RUNNING");

});

app.listen(

 process.env.PORT || 3000,

 () => {

  console.log(
   "Server Started"
  );

 }

);

// ================= START BOT =================

bot.start();

console.log("Bot Started");
