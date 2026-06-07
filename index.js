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

// ================= CARD =================

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
      { text: "🎫 ارسال تیکت" }
    ],
    ...(userId == config.adminId
      ? [[{ text: "⚙️ مدیریت کانفیگ" }]]
      : [])
  ]).resized();
}

// ================= BOT CHECK =================

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!botEnabled && userId != config.adminId) {
    return ctx.reply("🔴 ربات خاموش است");
  }

  await next();
});

// ================= START =================

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;

  db.createUser(userId, ctx.from.username || "user", ctx.from.first_name || "User");

  await ctx.reply("سلام 👋", {
    reply_markup: mainKeyboard(userId)
  });
});

// ================= TEXT HANDLER =================

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // BUY MENU
  if (text === "🔐 خرید اشتراک") {
    const keyboard = new InlineKeyboard()
      .text("OpenVPN یک ماهه - ۵۵۰,۰۰۰ تومان", "buy_1")
      .row()
      .text("OpenVPN سه ماهه - ۱,۰۰۰,۰۰۰ تومان", "buy_3");

    return ctx.reply("پلن را انتخاب کنید", { reply_markup: keyboard });
  }

  // SERVICES
  if (text === "🛍 سرویس‌های من") {
    const services = db.getPurchases(userId);

    if (!services.length)
      return ctx.reply("سرویسی ندارید");

    for (const s of services) {
      await ctx.reply(`📦 ${s.type}\n\n${s.config}`);

      try {
        const qr = await QRCode.toBuffer(s.config);
        await ctx.replyWithPhoto({ source: qr });
      } catch {}
    }
  }

  // TICKET
  if (text === "🎫 ارسال تیکت") {
    ticketMode[userId] = true;
    return ctx.reply("پیام خود را ارسال کنید");
  }

  if (ticketMode[userId]) {
    delete ticketMode[userId];

    await bot.api.sendMessage(
      config.adminId,
      `🎫 تیکت جدید\n\n👤 ${userId}\n\n${text}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "💬 پاسخ", callback_data: `reply_${userId}` }
          ]]
        }
      }
    );

    return ctx.reply("ارسال شد");
  }

  // ADMIN PANEL
  if (text === "⚙️ مدیریت کانفیگ" && userId == config.adminId) {
    return ctx.reply("پنل:\nadd 1\nadd 3");
  }

  // ADD CONFIG
  if (text.startsWith("add ") && userId == config.adminId) {
    adminMode[userId] = text.replace("add ", "");
    return ctx.reply("کانفیگ‌ها را بفرست (done پایان)");
  }

  if (adminMode[userId] && userId == config.adminId) {
    if (text === "done") {
      delete adminMode[userId];
      return ctx.reply("تمام شد");
    }

    let count = 0;

    text.split("\n").forEach(line => {
      if (line.startsWith("vless://")) {
        db.addConfig(adminMode[userId], line.trim());
        count++;
      }
    });

    return ctx.reply(`ذخیره شد: ${count}`);
  }
});

// ================= RECEIPT =================

bot.on("message:photo", async (ctx) => {
  const userId = ctx.from.id;

  if (!pendingReceipts[userId]) return;

  const type = pendingReceipts[userId];
  delete pendingReceipts[userId];

  const photo = ctx.message.photo.pop();

  await bot.api.sendPhoto(
    config.adminId,
    photo.file_id,
    {
      caption: `رسید\nUser: ${userId}\nPlan: ${type}`,
      reply_markup: {
        inline_keyboard: [[
          { text: "تایید", callback_data: `approve_${userId}_${type}` }
        ]]
      }
    }
  );

  ctx.reply("ارسال شد");
});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  const plans = {
    buy_1: "1MONTH",
    buy_3: "3MONTH"
  };

  // BUY
  if (plans[data]) {
    const type = plans[data];

    const keyboard = new InlineKeyboard()
      .text("📋 کارت", "copy_card")
      .row()
      .text("📸 ارسال رسید", `receipt_${type}`);

    return ctx.reply(
`💳 پرداخت کارت

📌 ${CARD_NUMBER}
👤 ${CARD_NAME}`,

      { reply_markup: keyboard }
    );
  }

  // RECEIPT
  if (data.startsWith("receipt_")) {
    pendingReceipts[userId] = data.replace("receipt_", "");
    return ctx.reply("عکس رسید را بفرست");
  }

  // COPY CARD
  if (data === "copy_card") {
    return ctx.answerCallbackQuery({
      text: CARD_NUMBER,
      show_alert: true
    });
  }

  // APPROVE
  if (data.startsWith("approve_") && userId == config.adminId) {
    const [, target, type] = data.split("_");

    const cfg = db.getConfig(type);

    if (!cfg) return ctx.reply("کانفیگ نیست");

    db.useConfig(cfg.id);
    db.addPurchase(target, type, cfg.config);

    await bot.api.sendMessage(target, `✅ تایید شد\n\n${cfg.config}`);

    return ctx.reply("انجام شد");
  }
});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

bot.start();
console.log("Bot Started");
