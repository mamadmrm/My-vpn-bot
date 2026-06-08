const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const db = require("./database");
const config = require("./config.json");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= CONFIG =================

const XUI = {
  url: "https://mirzaserver.sbs:2091",
  username: "gg88cruq73",
  password: "5er9zqmId8",
  inbound: 4
};

// ================= STATE =================

let cookie = "";
const ticketMode = {};
const replyMode = {};
const pendingReceipts = {};
let botEnabled = true;

// ================= GLOBAL SAFETY =================

process.on("unhandledRejection", (e) => {
  console.log("UNHANDLED:", e);
});

process.on("uncaughtException", (e) => {
  console.log("CRASH:", e);
});

// ================= LOGIN SAFE =================

async function login() {
  try {
    const res = await axios.post(`${XUI.url}/panel/api/login`, {
      username: XUI.username,
      password: XUI.password
    });

    cookie = res.headers?.["set-cookie"]?.join("; ") || "";
    return true;
  } catch (e) {
    console.log("LOGIN ERROR:", e.message);
    return false;
  }
}

// ================= CREATE CLIENT =================

async function createClient(email, gb, days = 30) {
  const ok = await login();
  if (!ok) throw new Error("XUI LOGIN FAILED");

  const expiryTime = Date.now() + days * 86400000;

  const res = await axios.post(
    `${XUI.url}/panel/api/clients/add`,
    {
      client: {
        email,
        totalGB: gb * 1024 * 1024 * 1024,
        expiryTime,
        tgId: 0,
        limitIp: 0,
        enable: true
      },
      inboundIds: [XUI.inbound]
    },
    { headers: { Cookie: cookie } }
  );

  return {
    success: true,
    sub: `${XUI.url}/sub/${email}`
  };
}

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
      ? [[{ text: "⚙️ مدیریت" }]]
      : [])
  ]).resized();
}

// ================= BOT CHECK =================

bot.use(async (ctx, next) => {
  if (!botEnabled && ctx.from?.id != config.adminId) {
    return ctx.reply("🔴 ربات خاموش است");
  }
  await next();
});

// ================= START =================

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;

  db.createUser(
    userId,
    ctx.from.username || "unknown",
    ctx.from.first_name || "user"
  );

  await ctx.reply("👋 خوش آمدید", {
    reply_markup: mainKeyboard(userId)
  });
});

// ================= MESSAGE =================

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // BUY MENU
  if (text === "🔐 خرید اشتراک") {
    const kb = new InlineKeyboard()
      .text("50GB - 180K", "buy_50")
      .row()
      .text("100GB - 350K", "buy_100")
      .row()
      .text("200GB - 650K", "buy_200");

    return ctx.reply("پلن رو انتخاب کن", { reply_markup: kb });
  }

  // SERVICES
  if (text === "🛍 سرویس‌های من") {
    const list = db.getPurchases(userId);

    if (!list.length)
      return ctx.reply("نداری سرویس");

    for (const s of list) {
      await ctx.reply(s.config);

      try {
        const qr = await QRCode.toBuffer(s.config);
        await ctx.replyWithPhoto({ source: qr });
      } catch {}
    }
  }

  // TICKET
  if (text === "🎫 ارسال تیکت") {
    ticketMode[userId] = true;
    return ctx.reply("پیام بده");
  }

  if (ticketMode[userId]) {
    delete ticketMode[userId];

    await bot.api.sendMessage(
      config.adminId,
      `📩 تیکت\n\n${userId}\n\n${text}`
    );

    return ctx.reply("ارسال شد");
  }

  // ADMIN PANEL
  if (text === "⚙️ مدیریت" && userId == config.adminId) {
    return ctx.reply("پنل فعال است");
  }
});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const uid = ctx.from.id;

  const plans = {
    buy_50: { gb: 50, price: 180000 },
    buy_100: { gb: 100, price: 350000 },
    buy_200: { gb: 200, price: 650000 }
  };

  // BUY
  if (plans[data]) {
    const p = plans[data];

    return ctx.reply(
`💳 کارت:
6221061206262828

👤 محمدرضا میرزاآقایی

💰 ${p.price}

بعد پرداخت رسید بفرست`,
      {
        reply_markup: new InlineKeyboard()
          .text("📸 ارسال رسید", `receipt_${data}`)
      }
    );
  }

  // RECEIPT REQUEST
  if (data.startsWith("receipt_")) {
    const type = data.replace("receipt_", "");
    pendingReceipts[uid] = type;

    return ctx.reply("عکس رسید رو بفرست");
  }

  // APPROVE (ADMIN)
  if (data.startsWith("approve_") && uid == config.adminId) {
    const [, userId, planKey] = data.split("_");

    const plan = plans[planKey];

    const email = `u${userId}_${Date.now()}`;

    try {
      const result = await createClient(email, plan.gb);

      db.addPurchase(userId, planKey, result.sub);

      await bot.api.sendMessage(
        userId,
        `✅ فعال شد\n\n${result.sub}`
      );

      return ctx.reply("OK");
    } catch (e) {
      console.log(e);
      return ctx.reply("ERROR");
    }
  }
});

// ================= RECEIPT PHOTO =================

bot.on("message:photo", async (ctx) => {
  const userId = ctx.from.id;

  if (!pendingReceipts[userId]) return;

  const type = pendingReceipts[userId];
  delete pendingReceipts[userId];

  const photo = ctx.message.photo.pop();

  await bot.api.sendPhoto(config.adminId, photo.file_id, {
    caption: `📩 رسید\n${userId}\n${type}`,
    reply_markup: {
      inline_keyboard: [[
        { text: "تایید", callback_data: `approve_${userId}_${type}` }
      ]]
    }
  });

  return ctx.reply("ارسال شد");
});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));

app.listen(process.env.PORT || 3000);

bot.start();

console.log("BOT RUNNING");
