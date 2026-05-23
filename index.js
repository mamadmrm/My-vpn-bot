require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
app.use(express.json());

// ⚠️ مهم: polling خاموش (فقط webhook)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

const db = new sqlite3.Database("./database.db");

// ================= DB =================

db.run(`CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS configs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT,
 config TEXT,
 used INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 config TEXT
)`);

// ================= WEBHOOK =================

const url = `https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  try {
    bot.processUpdate(req.body);
  } catch (e) {
    console.log("Update error:", e.message);
  }
  res.sendStatus(200);
});

bot.setWebHook(url).catch(() => {});

// ================= UI =================

const menu = {
  keyboard: [
    ["🛒 خرید اشتراک"],
    ["🎁 تست رایگان"],
    ["📦 سرویس‌های من"]
  ],
  resize_keyboard: true
};

// ================= START =================

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  db.run(`INSERT OR IGNORE INTO users(id) VALUES(?)`, [chatId]);

  bot.sendMessage(chatId,
`👋 خوش آمدید

🔹 خرید اشتراک
🔹 تست رایگان
🔹 سرویس‌ها`
  , {
    reply_markup: menu
  });
});

// ================= MESSAGE =================

bot.on("message", (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  // ---------- BUY ----------
  if (text === "🛒 خرید اشتراک") {
    return bot.sendMessage(chatId, "💰 انتخاب پلن:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "2GB - 340,000", callback_data: "buy_2" }],
          [{ text: "5GB - 800,000", callback_data: "buy_5" }],
          [{ text: "10GB - 1,500,000", callback_data: "buy_10" }]
        ]
      }
    });
  }

  // ---------- FREE ----------
  if (text === "🎁 تست رایگان") {
    db.get(`SELECT * FROM users WHERE id=?`, [chatId], (err, user) => {
      if (user?.free_used) {
        return bot.sendMessage(chatId, "❌ قبلاً تست گرفتی");
      }

      db.get(`SELECT * FROM configs WHERE type='FREE' AND used=0 LIMIT 1`, [], (err, row) => {
        if (!row) return bot.sendMessage(chatId, "❌ تست نداریم");

        db.run(`UPDATE users SET free_used=1 WHERE id=?`, [chatId]);
        db.run(`UPDATE configs SET used=1 WHERE id=?`, [row.id]);

        db.run(`INSERT INTO services(user_id,config) VALUES(?,?)`, [chatId, row.config]);

        bot.sendMessage(chatId, "🎁 تست شما:\n\n" + row.config);
      });
    });
  }

  // ---------- SERVICES ----------
  if (text === "📦 سرویس‌های من") {
    db.all(`SELECT * FROM services WHERE user_id=?`, [chatId], (err, rows) => {
      if (!rows || rows.length === 0) {
        return bot.sendMessage(chatId, "❌ سرویسی نداری");
      }

      let msgText = "📦 سرویس‌های شما:\n\n";
      rows.forEach(r => msgText += r.config + "\n\n");

      bot.sendMessage(chatId, msgText);
    });
  }
});

// ================= CALLBACK (PAYMENT ONLY) =================

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!data.startsWith("buy_")) return;

  const plans = {
    buy_2: { name: "2GB", amount: 340000 },
    buy_5: { name: "5GB", amount: 800000 },
    buy_10: { name: "10GB", amount: 1500000 }
  };

  const plan = plans[data];
  if (!plan) return;

  try {
    const orderId = `${chatId}_${Date.now()}`;
    const usd = Math.max(Math.round(plan.amount / 60000), 1);

    const res = await axios.get("https://api.plisio.net/api/v1/invoices/new", {
      params: {
        api_key: process.env.PLISIO_SECRET_KEY,
        order_number: orderId,
        order_name: plan.name,
        source_currency: "USD",
        source_amount: usd,
        currency: "TON",
        email: "test@test.com",
        callback_url: `https://${process.env.RAILWAY_STATIC_URL}/plisio`
      }
    });

    const payUrl = res.data?.data?.invoice_url;

    if (!payUrl) {
      return bot.sendMessage(chatId, "❌ خطا در ساخت پرداخت");
    }

    bot.sendMessage(chatId, "💳 لینک پرداخت:", {
      reply_markup: {
        inline_keyboard: [[{ text: "پرداخت", url: payUrl }]]
      }
    });

  } catch (e) {
    console.log("PAY ERROR:", e.message);
    bot.sendMessage(chatId, "❌ خطا در پرداخت");
  }
});

// ================= SERVER =================

app.listen(process.env.PORT || 3000, () => {
  console.log("BOT RUNNING");
});
