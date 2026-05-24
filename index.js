const { Bot, Keyboard } = require('grammy');
const express = require('express');

const db = require('./database');
const config = require('./config.json');

const bot = new Bot(config.botToken);
const app = express();
app.use(express.json());

function mainKeyboard() {
  return Keyboard.from([
    [{ text: '🛒 خرید اشتراک' }, { text: '📦 سرویس‌های من' }],
    [{ text: '🎁 تست رایگان' }, { text: '📞 پشتیبانی' }]
  ]).resized();
}

function planKeyboard() {
  return Keyboard.from([
    [{ text: '💾 ۲ گیگ - ۳۴۰ هزار تومان' }],
    [{ text: '💾 ۵ گیگ - ۸۰۰ هزار تومان' }],
    [{ text: '💾 ۱۰ گیگ - ۱,۵۰۰,۰۰۰ تومان' }],
    [{ text: '🔙 بازگشت' }]
  ]).resized();
}

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

async function createPlisioInvoice(amount, userId, planId) {
  try {
    const response = await fetch('https://plisio.net/api/v1/invoices/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.plisioSecret
      },
      body: JSON.stringify({
        amount: amount / 50000,
        currency: 'USD',
        order_number: userId + '_' + planId + '_' + Date.now(),
        order_name: 'VPN ' + planId,
        callback_url: 'https://your-project.up.railway.app/webhook?userId=' + userId + '&planId=' + planId,
        redirect_url: 'https://t.me/' + bot.bot.username
      })
    });
    return await response.json();
  } catch (e) {
    console.error('Plisio Error:', e);
    return null;
  }
}

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'unknown';
  const firstName = ctx.from.first_name || 'کاربر';
  
  db.createUser(userId, username, firstName);
  
  await ctx.reply('🎉 به ربات فروش VPN خوش آمدید!\n\nلطفا یکی از گزینه‌ها را انتخاب کنید:', {
    reply_markup: mainKeyboard()
  });
});

bot.command('admin', async (ctx) => {
  if (ctx.from.id != config.adminId) {
    return ctx.reply('⛔️ دسترسی غیرمجاز');
  }
  
  await ctx.reply('⚙️ پنل مدیریت:', {
    reply_markup: adminKeyboard()
  });
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  const isAdmin = userId == config.adminId;
  
  if (text === '🛒 خرید اشتراک') {
    await ctx.reply('💰 لطفا پلن مورد نظر را انتخاب کنید:', {
      reply_markup: planKeyboard()
    });
  } else if (text === '📦 سرویس‌های من') {
    const user = db.getUser(userId);
    if (!user || !user.purchases || user.purchases.length === 0) {
      await ctx.reply('❌ شما هنوز اشتراکی خریداری نکرده‌اید!');
      return;
    }
    
    let msg = '📦 سرویس‌های شما:\n\n';
    user.purchases.forEach(function(p, i) {
      const plan = config.plans.find(function(pl) { return pl.id === p.planId; });
      msg += (i+1) + '. ' + plan.name + '\n';
      msg += '⏰ انقضا: ' + new Date(p.expireDate).toLocaleDateString('fa-IR') + '\n';
      msg += '```\n' + p.config + '\n```\n\n';
    });
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } else if (text === '🎁 تست رایگان') {
    const user = db.getUser(userId);
    if (user && user.hasFreeTest) {
      await ctx.reply('❌ شما قبلا از تست رایگان استفاده کرده‌اید!');
      return;
    }
    
    const freeConfig = db.getConfig('freeTest') || config.freeTestConfig;
    if (!freeConfig) {
      await ctx.reply('❌ کانفیگ تست رایگان موجود نیست. به پشتیبانی پیام دهید.');
      return;
    }
    
    await ctx.reply('🎁 تست رایگان یک روزه\n\nکانفیگ زیر را کپی کنید:\n\n```\n' + freeConfig + '\n```\n\n⚠️ این تست فقط یکبار قابل استفاده است.', {
      parse_mode: 'Markdown'
    });
    
    db.setFreeTestUsed(userId);
  } else if (text === '📞 پشتیبانی') {
    await ctx.reply('📞 برای تماس با پشتیبانی به @admin پیا…
