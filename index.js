const { Bot, Keyboard } = require('grammy');
const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const db = require('./database');
const config = require('./config.json');

const bot = new Bot(config.botToken);
const app = express();
app.use(express.json());

// ============ Glassmorphism Keyboard ============
function mainKeyboard() {
  return Keyboard.from([
    [{ text: '🛒 خرید اشتراک' }, { text: '📦 سرویس‌های من' }],
    [{ text: '🎁 تست رایگان' }, { text: '📞 پشتیبانی' }]
  ]).resized();
}

function adminKeyboard() {
  return Keyboard.from([
    [{ text: '➕ افزودن کانفیگ اشتراک' }, { text: '➕ افزودن کانفیگ تست رایگان' }],
    [{ text: '👥 لیست کاربران' }, { text: '📊 آمار' }],
    [{ text: '🔙 بازگشت' }]
  ]).resized();
}

function planKeyboard() {
  return Keyboard.from([
    [{ text: '💾 ۲ گیگ - ۲ دلار' }],
    [{ text: '💾 ۵ گیگ - ۴ دلار' }],
    [{ text: '💾 ۱۰ گیگ - ۹ دلار' }],
    [{ text: '🔙 بازگشت' }]
  ]).resized();
}

// ============ Plisio Payment ============…
