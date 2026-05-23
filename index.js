require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");
const QRCode = require("qrcode");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

const db = new sqlite3.Database("./database.db");

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ================= DB =================

db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, free_used INTEGER DEFAULT 0)`);
db.run(`CREATE TABLE IF NOT EXISTS configs (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, config TEXT, used INTEGER DEFAULT 0)`);
db.run(`CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, config TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS payments (chat_id INTEGER PRIMARY KEY, order_id TEXT, pay_url TEXT, type TEXT, created_at INTEGER)`);

// ================= WEBHOOK =================

const WEBHOOK_URL = `https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  try {
    bot.processUpdate(req.body);
  } catch (e) {
    console.log("Webhook error:", e.message);
  }
  res.sendStatus(200);
});

// set webhook safely
bot.setWebHook(WEBHOOK_URL).catch(() => {});

// ================= MENU =================

const menu = {
  keyboard: [
    ["🛒 خرید اشتراک", "🎁 تست رایگان"],
    ["📦 سرویس‌های من"]
  ],
  resize_keyboard: true
};

// ================= START =================

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

  bot.sendMessage(chatId, "👋 خوش آمدید", {
    reply_markup: menu
  });
});

// ================= MESSAGE =================

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  // BUY MENU
  if (text === "🛒 خرید اشتراک") {
    return bot.sendMessage(chatId, "💰 پلن‌ها:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "2GB - 340,000", callback_data: "buy_2" }],
          [{ text: "5GB - 800,000", callback_data: "buy_5" }],
          [{ text: "10GB - 1,500,000", callback_data: "buy_10" }]
        ]
      }
    });
  }

  // FREE TEST
  if (text === "🎁 تست رایگان") {
    db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {
      if (!user || user.free_used) {
        return bot.sendMessage(chatId, "❌ تست قبلاً استفاده شده");
      }

      db.get(`SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`, [], (err, row) => {
        if (!row) return bot.sendMessage(chatId, "❌ تست موجود نیست");

        db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
        db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

        sendConfig(chatId, row.config);
      });
    });
  }

  // MY SERVICES
  if (text === "📦 سرویس‌های من") {
    db.all(`SELECT * FROM services WHERE user_id=?`, [chatId], (err, rows) => {
      if (!rows || rows.length === 0)
        return bot.sendMessage(chatId, "❌ سرویسی نداری");

      rows.forEach(r => sendConfig(chatId, r.config));
    });
  }
});

// ================= CALLBACK =================

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!data || !data.startsWith("buy_")) return;

  const plans = {
    buy_2: { type: "2GB", amount: 340000 },
    buy_5: { type: "5GB", amount: 800000 },
    buy_10: { type: "10GB", amount: 1500000 }
  };

  const plan = plans[data];
  if (!plan) return;

  try {
    const orderId = `${chatId}_${Date.now()}`;
    const usd = Math.max(Math.round(plan.amount / 60000), 1);

    const response = await axios.get(
      "https://api.plisio.net/api/v1/invoices/new",
      {
        params: {
          api_key: process.env.PLISIO_SECRET_KEY,
          order_number: orderId,
          order_name: plan.type,
          source_currency: "USD",
          source_amount: usd,
          currency: "TON",
          email: "test@test.com",
          callback_url: `https://${process.env.RAILWAY_STATIC_URL}/plisio`
        }
      }
    );

    const payUrl = response.data?.data?.invoice_url;

    if (!payUrl) {
      return bot.sendMessage(chatId, "❌ خطا در ساخت لینک پرداخت");
    }

    db.run(
      `INSERT OR REPLACE INTO payments(chat_id,order_id,pay_url,type,created_at)
       VALUES(?,?,?,?,?)`,
      [chatId, orderId, payUrl, plan.type, Date.now()]
    );

    bot.sendMessage(chatId, "💳 پرداخت:", {
      reply_markup: {
        inline_keyboard: [[{ text: "💰 پرداخت", url: payUrl }]]
      }
    });

  } catch (e) {
    console.log("PAY ERROR:", e.message);
    bot.sendMessage(chatId, "❌ خطا در پرداخت");
  }
});

// ================= QR =================

async function sendConfig(chatId, config) {
  try {
    const qr = await QRCode.toBuffer(config);
    await bot.sendPhoto(chatId, qr, { caption: "📦 کانفیگ شما\n\n" + config });
  } catch {
    await bot.sendMessage(chatId, "📦 کانفیگ:\n\n" + config);
  }
}

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
  console.log("Bot running...");
});
