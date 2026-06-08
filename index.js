const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const axios = require("axios");
const express = require("express");

const config = require("./config.json");
const db = require("./database");

const bot = new Bot(config.botToken);
const app = express();

app.use(express.json());

// ================= XUI CONFIG =================

const XUI = {
  baseUrl: "https://mirzaserver.sbs:2091",
  username: "gg88cruq73",
  password: "5er9zqmId8",
  inboundId: 4,
  cookie: null
};

// ================= LOGIN =================

async function login() {
  try {
    const res = await axios.post(`${XUI.baseUrl}/login`, {
      username: XUI.username,
      password: XUI.password
    });

    XUI.cookie = res.headers["set-cookie"];
    return true;

  } catch (e) {
    console.log("LOGIN ERROR", e.message);
    return false;
  }
}

// ================= CREATE USER =================

async function createUser(userId, plan) {
  const email = `u_${userId}_${Date.now()}`;

  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const payload = {
    id: XUI.inboundId,
    settings: JSON.stringify({
      clients: [
        {
          email,
          enable: true,
          totalGB: plan.gb * 1024 * 1024 * 1024,
          expiryTime: expiry,
          limitIp: 0
        }
      ]
    })
  };

  const res = await axios.post(
    `${XUI.baseUrl}/panel/api/inbounds/addClient`,
    payload,
    {
      headers: {
        Cookie: XUI.cookie
      }
    }
  );

  return {
    email,
    success: res.data.success,
    link: `${XUI.baseUrl}/sub/${email}`
  };
}

// ================= PLANS =================

const plans = {
  buy_50: { gb: 50, name: "50GB" },
  buy_100: { gb: 100, name: "100GB" },
  buy_200: { gb: 200, name: "200GB" }
};

// ================= UI =================

function mainKeyboard() {
  return Keyboard.from([
    [{ text: "🔐 خرید اشتراک" }],
    [{ text: "🛍 سرویس‌های من" }]
  ]).resized();
}

// ================= START =================

bot.command("start", async (ctx) => {
  await ctx.reply("VPN BOT ACTIVE", {
    reply_markup: mainKeyboard()
  });
});

// ================= BUY =================

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  if (text === "🔐 خرید اشتراک") {
    const kb = new InlineKeyboard()
      .text("50GB - 180K", "buy_50")
      .row()
      .text("100GB - 350K", "buy_100")
      .row()
      .text("200GB - 650K", "buy_200");

    return ctx.reply("پلن را انتخاب کن", {
      reply_markup: kb
    });
  }
});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  if (!plans[data]) return;

  ctx.reply("📸 رسید پرداخت را ارسال کنید");

  ctx.session = data;
});

// ================= RECEIPT =================

bot.on("message:photo", async (ctx) => {
  const userId = ctx.from.id;

  const photo = ctx.message.photo.pop();
  const planKey = ctx.session;

  await bot.api.sendPhoto(config.adminId, photo.file_id, {
    caption: `PAYMENT\nUSER:${userId}\nPLAN:${planKey}`,
    reply_markup: {
      inline_keyboard: [[
        {
          text: "APPROVE",
          callback_data: `approve_${userId}_${planKey}`
        }
      ]]
    }
  });

  ctx.reply("رسید ارسال شد");
});

// ================= APPROVE =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (!data.startsWith("approve_")) return;

  const [, userId, planKey] = data.split("_");

  const plan = plans[planKey];

  const ok = await login();

  if (!ok) return ctx.reply("LOGIN FAILED");

  const result = await createUser(userId, plan);

  if (!result.success) {
    return ctx.reply("ERROR CREATING USER");
  }

  await bot.api.sendMessage(
    userId,
`✅ سرویس فعال شد

📦 حجم: ${plan.gb}GB
🔗 لینک:
${result.link}`
  );

  ctx.reply("DONE");
});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

bot.start();

console.log("BOT RUNNING FULL PRO MODE");
