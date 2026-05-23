require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN);

const db = new sqlite3.Database("./database.db");

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ---------------- DATABASE ----------------

db.run(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS configs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT,
 config TEXT,
 used INTEGER DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 config TEXT
)
`);

// ---------------- WEBHOOK ----------------

const WEBHOOK_URL =
  `https://${process.env.RAILWAY_STATIC_URL}/bot${process.env.BOT_TOKEN}`;

bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ---------------- START ----------------

bot.onText(/\/start/, (msg) => {

  const chatId = msg.chat.id;

  db.run(
    `INSERT OR IGNORE INTO users(id) VALUES(?)`,
    [chatId]
  );

  bot.sendMessage(chatId, "🌐 به ربات VPN خوش اومدی", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 خرید اشتراک", callback_data: "buy" }],
        [{ text: "🎁 تست رایگان", callback_data: "free" }],
        [{ text: "📦 سرویس‌های من", callback_data: "my" }]
      ]
    }
  });

});

// ---------------- CALLBACKS ----------------

let payments = {};

bot.on("callback_query", async (q) => {

  const chatId = q.message.chat.id;
  const data = q.data;

  // BUY MENU
  if (data === "buy") {

    return bot.sendMessage(chatId, "پلن موردنظر:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "2GB - 2$", callback_data: "buy_2GB" }],
          [{ text: "5GB - 4$", callback_data: "buy_5GB" }],
          [{ text: "10GB - 9$", callback_data: "buy_10GB" }]
        ]
      }
    });

  }

  // BUY PROCESS
  if (data.startsWith("buy_")) {

    let amount = 2;
    let type = "2GB";

    if (data === "buy_5GB") {
      amount = 4;
      type = "5GB";
    }

    if (data === "buy_10GB") {
      amount = 9;
      type = "10GB";
    }

    try {

      const orderId = `${chatId}_${Date.now()}`;

      payments[orderId] = {
        chatId,
        type
      };

      const response = await axios.post(
        "https://api.plisio.net/api/v1/invoices/new",
        new URLSearchParams({
          source_currency: "USD",
          source_amount: amount.toString(),
          currency: "USDT",
          order_number: orderId,
          email: "test@test.com",
          callback_url:
            `https://${process.env.RAILWAY_STATIC_URL}/plisio`,
          api_key: process.env.PLISIO_SECRET_KEY
        }),
        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          }
        }
      );

      const payUrl =
        response.data.data.invoice_url;

      bot.sendMessage(chatId, "💳 پرداخت:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 پرداخت", url: payUrl }]
          ]
        }
      });

    } catch (e) {

      console.log(e.response?.data || e.message);

      bot.sendMessage(chatId, "❌ خطا در پرداخت");

    }

  }

  // FREE TEST
  if (data === "free") {

    db.get(
      `SELECT * FROM users WHERE id=?`,
      [chatId],
      (err, user) => {

        if (!user) return;

        if (user.free_used === 1) {
          return bot.sendMessage(
            chatId,
            "❌ قبلاً تست گرفتی"
          );
        }

        db.get(
          `SELECT * FROM configs
           WHERE type='FREE'
           AND used=0 LIMIT 1`,
          [],
          (err, row) => {

            if (!row) {
              return bot.sendMessage(
                chatId,
                "❌ تست موجود نیست"
              );
            }

            db.run(
              `UPDATE users
               SET free_used=1
               WHERE id=?`,
              [chatId]
            );

            db.run(
              `UPDATE configs
               SET used=1
               WHERE id=?`,
              [row.id]
            );

            db.run(
              `INSERT INTO services(user_id,config)
               VALUES(?,?)`,
              [chatId, row.config]
            );

            bot.sendMessage(
              chatId,
              `🎁 تست رایگان:\n\n${row.config}`
            );

          }
        );

      }
    );

  }

  // MY SERVICES
  if (data === "my") {

    db.all(
      `SELECT * FROM services WHERE user_id=?`,
      [chatId],
      (err, rows) => {

        if (!rows.length) {
          return bot.sendMessage(
            chatId,
            "❌ سرویسی نداری"
          );
        }

        rows.forEach((r) => {
          bot.sendMessage(chatId, r.config);
        });

      }
    );

  }

  // ADMIN ADD CONFIG
  if (
    q.message.chat.id === ADMIN_ID &&
    data.startsWith("add_")
  ) {

    waitingType = data.replace("add_", "");

    waitingAdmin = true;

    bot.sendMessage(
      ADMIN_ID,
      `📥 کانفیگ ${waitingType} بفرست`
    );

  }

});

// ---------------- PLISIO WEBHOOK ----------------

app.post("/plisio", (req, res) => {

  const body = req.body;

  if (body.status === "completed") {

    const orderId = body.order_number;

    const payment = payments[orderId];

    if (!payment) {
      return res.sendStatus(200);
    }

    db.get(
      `SELECT * FROM configs
       WHERE type=?
       AND used=0 LIMIT 1`,
      [payment.type],
      (err, row) => {

        if (!row) return;

        db.run(
          `UPDATE configs
           SET used=1
           WHERE id=?`,
          [row.id]
        );

        db.run(
          `INSERT INTO services(user_id,config)
           VALUES(?,?)`,
          [payment.chatId, row.config]
        );

        bot.sendMessage(
          payment.chatId,
          `✅ پرداخت موفق\n\n${row.config}`
        );

      }
    );

  }

  res.sendStatus(200);

});

// ---------------- ADMIN ----------------

let waitingAdmin = false;
let waitingType = "";

bot.onText(/\/admin/, (msg) => {

  if (msg.chat.id !== ADMIN_ID) return;

  bot.sendMessage(ADMIN_ID, "⚙️ پنل ادمین", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ 2GB", callback_data: "add_2GB" }],
        [{ text: "➕ 5GB", callback_data: "add_5GB" }],
        [{ text: "➕ 10GB", callback_data: "add_10GB" }],
        [{ text: "➕ FREE", callback_data: "add_FREE" }]
      ]
    }
  });

});

bot.on("message", (msg) => {

  if (msg.chat.id !== ADMIN_ID) return;

  if (!waitingAdmin) return;

  if (
    msg.text &&
    msg.text.startsWith("vless://")
  ) {

    db.run(
      `INSERT INTO configs(type,config)
       VALUES(?,?)`,
      [waitingType, msg.text]
    );

    waitingAdmin = false;

    bot.sendMessage(
      ADMIN_ID,
      "✅ ذخیره شد"
    );

  }

});

// ---------------- SERVER ----------------

app.listen(process.env.PORT || 3000, () => {
  console.log("Bot Running...");
});
