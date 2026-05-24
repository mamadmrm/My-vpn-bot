const { Bot, Keyboard } = require('grammy');
const express = require('express');

const db = require('./database');
const config = require('./config.json');

const bot = new Bot(config.botToken);
const app = express();
app.use(express.json());

// کیبورد اصلی
function mainKeyboard() {
  return Keyboard.from([
    [{ text: '🛒 خرید اشتراک' }, { text: '📦 سرویس‌های من' }],
    [{ text: '🎁 تست رایگان' }, { text: '📞 پشتیبانی' }]
  ]).resized();
}

// کیبورد پلن‌ها
function planKeyboard() {
  return Keyboard.from([
    [{ text: '💾 ۲ گیگ - ۳۴۰ هزار تومان' }],
    [{ text: '💾 ۵ گیگ - ۸۰۰ هزار تومان' }],
    [{ text: '💾 ۱۰ گیگ - ۱,۵۰۰,۰۰۰ تومان' }],
    [{ text: '🔙 بازگشت' }]
  ]).resized();
}

// کیبورد مدیر
function adminKeyboard() {
  return Keyboard.from([
    [{ text: '➕ افزودن کانفیگ ۲ گیگ' }],
    [{ text: '➕ افزودن کانفیگ ۵ گیگ' }],
    [{ text: '➕ افزودن کانفیگ ۱۰ گیگ' }],
    [{ text: '➕ افزودن کانفیگ تست رایگان' }],
    [{ text: '👥 لیست کاربران' }, { text: '📊 آمار' }],
    [{ text: '🔙 بازگشت' }]
  ]).resized();
}

// ساخت فاکتور Plisio
async function createPlisioInvoice(amount, userId, planId) {
  try {
    const response = await fetch('https://plisio.net/api/v1/invoices/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.plisioSecret
      },
      body: JSON.stringify({
        amount: amount / 50000, // تبدیل تومان به دلار (هر دلار حدود ۵۰۰۰۰ تومان)
        currency: 'USD',
        order_number: userId + '_' + planId + '_' + Date.now(),
        order_name: 'VPN ' + planId,
        callback_url: 'https://your-project-name.up.railway.app/webhook?userId=' + userId + '&planId=' + planId,
        redirect_url: 'https://t.me/' + bot.bot.username
      })
    });
    return await response.json();
  } catch (e) {
    console.error('Plisio Error:', e);
    return null;
  }
}

// دستور /start
bot.command('start', as…
