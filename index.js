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
  url: "https://mirzaserver.sbs:2091",
  username: "gg88cruq73",
  password: "5er9zqmId8",
  inboundId: 4,
  session: null
};

// ================= PLANS =================

const plans = {
  buy_50: { gb: 50, days: 30, name: "50GB" },
  buy_100: { gb: 100, days: 30, name: "100GB" },
  buy_200: { gb: 200, days: 30, name: "200GB" }
};

// ================= LOGIN XUI =================

async function loginXUI() {
  try {
    const res = await axios.post(`${XUI.url}/login`, {
      username: XUI.username,
      password: XUI.password
    });

    XUI.session = res.headers["set-cookie"];
    console.log("XUI LOGIN OK");
  } catch (e) {
    console.log("XUI LOGIN FAIL", e.message);
  }
}

// ================= CREATE CLIENT =================

async function createClient(email, gb, days) {
  const expiry = Date.now() + days * 24 * 60 * 60 * 1000;

  const data = {
    id: XUI.inboundId,
    settings: JSON.stringify({
      clients: [
        {
          email: email,
          limitIp: 0,
          totalGB: gb * 1024 * 1024 * 1024,
          expiryTime: expiry,
          enable: true
        }
      ]
    })
  };

  const res = await axios.post(
    `${XUI.url}/panel/api/inbounds/addClient`,
    data,
    {
      headers: {
        Cookie: XUI.session
      }
    }
  );

  return res.data;
}

// ================= KEYBOARD =================

function mainKeyboard() {
  return Keyboard.from([
    [{ text: "🔐 خرید اشتراک" }]
  ]).resized();
}

// ================= START =================

bot.command("start", async (ctx) => {
  await ctx.reply("VPN Bot Active", {
    reply_markup: mainKeyboard()
  });
});

// ================= BUY =================

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text === "🔐 خرید اشتراک") {
    const kb = new InlineKeyboard()
      .text("50GB", "buy_50")
      .row()
      .text("100GB", "buy_100")
      .row()
      .text("200GB", "buy_200");

    return ctx.reply("پلن را انتخاب کن", {
      reply_markup: kb
    });
  }
});

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  const plan = plans[data];

  if (!plan) return;

  await ctx.reply("📸 رسید پرداخت را ارسال کنید");

  ctx.session = data;
});

// ================= RECEIPT =================

bot.on("message:photo", async (ctx) => {
  const userId = ctx.from.id;

  const photo = ctx.message.photo.pop();

  const planKey = ctx.session;

  await bot.api.sendPhoto(config.adminId, photo.file_id, {
    caption: `New Payment\nUser: ${userId}\nPlan: ${planKey}`,
    reply_markup: {
      inline_keyboard: [[
        {
          text: "Approve",
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

  const email = `user_${userId}_${Date.now()}`;

  await loginXUI();

  const result = await createClient(
    email,
    plan.gb,
    plan.days
  );

  await bot.api.sendMessage(
    userId,
`✅ سرویس فعال شد

📦 حجم: ${plan.gb}GB
⏳ مدت: ${plan.days} روز

🔗 ساخته شد در پنل`
  );

  await ctx.reply("Done");
});

// ================= SERVER =================

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

bot.start();

console.log("BOT RUNNING REAL XUI");
