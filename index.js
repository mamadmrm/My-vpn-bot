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
  user: "gg88cruq73",
  pass: "5er9zqmId8",
  inbound: 4
};

let cookie = "";

// ================= LOGIN =================

async function login() {
  const res = await axios.post(`${XUI.url}/panel/api/login`, {
    username: XUI.user,
    password: XUI.pass
  });

  cookie = res.headers["set-cookie"]?.join("; ") || "";
}

// ================= CREATE CLIENT =================

async function createClient(email, gb, days = 30) {
  await login();

  const expiry = Date.now() + days * 86400000;

  await axios.post(
    `${XUI.url}/panel/api/clients/add`,
    {
      client: {
        email,
        totalGB: gb * 1024 * 1024 * 1024,
        expiryTime: expiry,
        tgId: 0,
        limitIp: 0,
        enable: true
      },
      inboundIds: [XUI.inbound]
    },
    { headers: { Cookie: cookie } }
  );

  return {
    email,
    sub: `${XUI.url}/sub/${email}`
  };
}

// ================= USAGE CHECK =================
// (اگر پنل ساپورت کند)

async function checkUsage(email) {
  try {
    const res = await axios.get(`${XUI.url}/panel/api/client/usage`, {
      headers: { Cookie: cookie },
      params: { email }
    });

    return res.data;
  } catch {
    return null;
  }
}

// ================= DELETE CLIENT =================

async function deleteClient(email) {
  try {
    await login();

    await axios.post(
      `${XUI.url}/panel/api/clients/delete`,
      { email },
      { headers: { Cookie: cookie } }
    );
  } catch {}
}

// ================= AUTO EXPIRE SYSTEM =================

async function autoDeleteExpired() {
  const users = db.getAllActiveClients?.() || [];

  for (const u of users) {
    if (Date.now() > u.expiry) {
      await deleteClient(u.email);
      db.markExpired(u.email);
    }
  }
}

setInterval(autoDeleteExpired, 60 * 60 * 1000); // هر 1 ساعت

// ================= EXTEND =================

async function extendClient(email, gb, days) {
  await login();

  const newExpiry = Date.now() + days * 86400000;

  await axios.post(
    `${XUI.url}/panel/api/clients/update`,
    {
      email,
      totalGB: gb * 1024 * 1024 * 1024,
      expiryTime: newExpiry
    },
    { headers: { Cookie: cookie } }
  );
}

// ================= BUY FLOW =================

const plans = {
  buy_50: { gb: 50, price: 180000 },
  buy_100: { gb: 100, price: 350000 },
  buy_200: { gb: 200, price: 650000 }
};

// ================= CALLBACK =================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const uid = ctx.from.id;

  // BUY
  if (plans[data]) {
    const p = plans[data];

    return ctx.reply(
`💳 کارت:
6221061206262828

💰 ${p.price}

بعد از پرداخت ارسال رسید`,
      {
        reply_markup: new InlineKeyboard()
          .text("ارسال رسید", `receipt_${data}`)
      }
    );
  }

  // APPROVE RECEIPT (ADMIN)
  if (data.startsWith("approve_")) {
    const [, userId, planKey] = data.split("_");

    const plan = plans[planKey];

    const email = `u${userId}_${Date.now()}`;

    const result = await createClient(email, plan.gb, 30);

    db.addPurchase(userId, planKey, result.sub);

    await bot.api.sendMessage(
      userId,
      `✅ سرویس فعال شد\n\n${result.sub}`
    );

    return ctx.reply("OK");
  }
});

// ================= SERVE =================

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

bot.start();

console.log("BOT RUNNING");
