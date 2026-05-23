require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
 polling: true
});

bot.onText(/\/start/, (msg) => {
 bot.sendMessage(msg.chat.id, "✅ ربات روشنه و کار میکنه");
});

bot.on('error', (err) => {
 console.log("BOT ERROR:", err);
});

console.log("Bot is running...");
