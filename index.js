const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= POOL LINKS =================
// اینا همون ساب‌هات هستن (باید واقعی باشن)
const pool = {
  "buy_50": [
    "https://mirzaserver.sbs:2096/sub/3p2rk83x8h0lg2vu"
  ],
  "buy_100": [
    "https://mirzaserver.sbs:2096/sub/b305cxdhf0tlqa86"
  ],
  "buy_200": [
    "https://mirzaserver.sbs:2096/sub/02k7e52cjjtv2zhg"
  ]
};

// ================= STATE =================

const pendingReceipts = {};
let botEnabled = true;

// ================= KEYBOARD =================

function mainKeyboard() {
  return Keyboard.from([
    [
      { text: "🔐 خرید اشتراک" },
      { text: "🛍 سرویس‌های من" }
    ]
  ]).resized();
}

// ================= START =================

bot.command("start", async (ctx) => {
  await ctx.reply("👋 خوش آمدی", {
    reply_markup: mainKeyboard()
  });
});

// ================= BUY =================

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text === "🔐 خرید اشتراک") {
    const kb = new InlineKeyboard()
      .text("50GB - 180K", "buy_50")
      .row()
      .text("100GB - 350K", "buy_100")
      .row()
      .text("200GB - 650K", "buy_200");

    return ctx.reply("پلن رو انتخاب کن", { reply_markup: kb });
  }

  if (text === "🛍 سرویس‌های من") {
    const list = db.getPurchases(userId);

    if (!list.length) return ctx.reply("سرویسی نداری");

    for (const s of list) {
      await ctx.reply(`🔗 سرویس شما:\n${s.config}`);
    }
  }
});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const uid = ctx.from.id;

  // BUY SELECT
  if (pool[data]) {
    return ctx.reply(
`💳 پرداخت کارت به کارت

6221061206262828
محمدرضا میرزاآقایی

بعد از پرداخت روی ارسال رسید بزن`,
      {
        reply_markup: new InlineKeyboard()
          .text("📸 ارسال رسید", `receipt_${data}`)
      }
    );
  }

  // RECEIPT REQUEST
  if (data.startsWith("receipt_")) {
    const plan = data.replace("receipt_", "");
    pendingReceipts[uid] = plan;

    return ctx.reply("📸 عکس رسید رو بفرست");
  }

  // APPROVE PAYMENT (ADMIN)
  if (data.startsWith("approve_")) {

    if (uid != config.adminId) {
      return ctx.answerCallbackQuery("اجازه نداری");
    }

    const [, userId, planKey] = data.split("_");

    const links = pool[planKey];

    if (!links || !links.length) {
      return ctx.reply("❌ لینک برای این پلن نداری");
    }

    const link = links.shift(); // هر بار یکی بده

    db.addPurchase(userId, planKey, link);

    await bot.api.sendMessage(
      userId,
      `✅ پرداخت تایید شد\n\n🔗 سرویس شما:\n${link}`
    );

    return ctx.reply("ارسال شد ✔️");
  }
});

// ================= PHOTO RECEIPT =================

bot.on("message:photo", async (ctx) => {
  const userId = ctx.from.id;

  if (!pendingReceipts[userId]) return;

  const plan = pendingReceipts[userId];
  delete pendingReceipts[userId];

  const photo = ctx.message.photo.pop();

  await bot.api.sendPhoto(config.adminId, photo.file_id, {
    caption: `📩 رسید\n${userId}\n${plan}`,
    reply_markup: {
      inline_keyboard: [[
        {
          text: "✅ تایید",
          callback_data: `approve_${userId}_${plan}`
        }
      ]]
    }
  });

  return ctx.reply("رسید ارسال شد ✔️");
});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

bot.start();

console.log("BOT RUNNING FIXED");
