const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= STATE =================

let botEnabled = true;
const pendingReceipts = {};
const ticketMode = {};

// ================= PLANS =================

const plans = {
  buy_50: {
    title: "50GB یک ماهه",
    price: "180,000",
    subPool: "https://mirzaserver.sbs:2096/sub/3p2rk83x8h0lg2vu"
  },
  buy_100: {
    title: "100GB یک ماهه",
    price: "350,000",
    subPool: "https://mirzaserver.sbs:2096/sub/b305cxdhf0tlqa86"
  },
  buy_200: {
    title: "200GB یک ماهه",
    price: "650,000",
    subPool: "https://mirzaserver.sbs:2096/sub/02k7e52cjjtv2zhg"
  }
};

// ================= KEYBOARD =================

function mainKeyboard() {
  return Keyboard.from([
    [
      { text: "🔐 خرید اشتراک" },
      { text: "🛍 سرویس‌های من" }
    ],
    [
      { text: "🎫 ارسال تیکت" }
    ],
    ...(config.adminId
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
    ctx.from.first_name || "user"
  );

  await ctx.reply("👋 خوش آمدید", {
    reply_markup: mainKeyboard()
  });
});

// ================= BOT OFF =================

bot.use(async (ctx, next) => {
  if (!botEnabled && ctx.from.id != config.adminId) {
    return ctx.reply("🔴 ربات خاموش است");
  }
  await next();
});

// ================= TEXT =================

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

    return ctx.reply("پلن را انتخاب کن", { reply_markup: kb });
  }

  if (text === "🛍 سرویس‌های من") {
    const list = db.getPurchases(userId);

    if (!list.length) return ctx.reply("نداری سرویس");

    for (const s of list) {
      await ctx.reply(`🔗 سرویس شما:\n${s.config}`);
    }
  }

  if (text === "🎫 ارسال تیکت") {
    ticketMode[userId] = true;
    return ctx.reply("پیام خود را ارسال کنید");
  }

  if (ticketMode[userId]) {
    delete ticketMode[userId];

    await bot.api.sendMessage(
      config.adminId,
      `🎫 تیکت\n\n${userId}\n\n${text}`
    );

    return ctx.reply("ارسال شد");
  }
});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const uid = ctx.from.id;

  // BUY
  if (plans[data]) {
    const p = plans[data];

    return ctx.reply(
`💳 پرداخت کارت به کارت

💰 مبلغ: ${p.price}

👤 به نام: محمدرضا میرزاآقایی

📦 سرویس: ${p.title}

⚠️ بعد از پرداخت رسید ارسال کنید`,
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

    return ctx.reply("📸 عکس رسید را ارسال کنید");
  }

  // ADMIN APPROVE
  if (data.startsWith("approve_") && uid == config.adminId) {
    const [, userId, planKey] = data.split("_");

    const plan = plans[planKey];

    const link = plan.subPool;

    db.addPurchase(userId, planKey, link);

    await bot.api.sendMessage(
      userId,
      `✅ پرداخت تایید شد\n\n🔗 لینک سرویس:\n${link}`
    );

    return ctx.reply("OK");
  }
});

// ================= RECEIPT PHOTO =================

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
        { text: "تایید", callback_data: `approve_${userId}_${plan}` }
      ]]
    }
  });

  return ctx.reply("رسید ارسال شد");
});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

bot.start();

console.log("BOT RUNNING (STABLE MODE)");
