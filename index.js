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
    [{ text: '📝 افزودن کانفیگ ۲ گیگ' }],
    [{ text: '📝 افزودن کانفیگ ۵ گیگ' }],
    [{ text: '📝 افزودن کانفیگ ۱۰ گیگ' }],
    [{ text: '📝 افزودن کانفیگ تست رایگان' }],
    [{ text: '👥 لیست کاربران' }, { text: '📊 آمار' }],
    [{ text: '🔙 بازگشت' }]
  ]).resized();
}

bot.command('start', async function(ctx) {
  var userId = ctx.from.id;
  var username = ctx.from.username || 'unknown';
  var firstName = ctx.from.first_name || 'User';
  
  db.createUser(userId, username, firstName);
  
  await ctx.reply('🎉 به ربات فروش VPN خوش آمدید!\n\nلطفا یکی از گزینه‌ها را انتخاب کنید:', {
    reply_markup: mainKeyboard()
  });
});

bot.command('admin', async function(ctx) {
  if (ctx.from.id != config.adminId) {
    return ctx.reply('⛔️ دسترسی غیرمجاز');
  }
  
  await ctx.reply('⚙️ پنل مدیریت:\n\nگزینه مورد نظر را انتخاب کنید:', {
    reply_markup: adminKeyboard()
  });
});

bot.on('message:text', async function(ctx) {
  var text = ctx.message.text;
  var userId = ctx.from.id;
  var isAdmin = userId == config.adminId;
  
  if (text === '🛒 خرید اشتراک') {
    await ctx.reply('💰 لطفا پلن مورد نظر را انتخاب کنید:', {
      reply_markup: planKeyboard()
    });
  } else if (text === '📦 سرویس‌های من') {
    var user = db.getUser(userId);
    if (!user || !user.purchases || user.purchases.length === 0) {
      await ctx.reply('❌ شما هنوز اشتراکی خریداری نکرده‌اید!');
      return;
    }
    var msg = '📦 سرویس‌های شما:\n\n';
    for (var i = 0; i < user.purchases.length; i++) {
      var p = user.purchases[i];
      msg += (i+1) + '. پلن: ' + p.planId + '\n';
      msg += '⏰ انقضا: ' + new Date(p.expireDate).toLocaleDateString('fa-IR') + '\n';
      msg += '```\n' + p.config + '\n```\n\n';
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } else if (text === '🎁 تست رایگان') {
    var user = db.getUser(userId);
    if (user && user.hasFreeTest) {
      await ctx.reply('❌ شما قبلا از تست رایگان استفاده کرده‌اید!');
      return;
    }
    var freeConfig = db.getConfig('freeTest') || config.freeTestConfig;
    if (!freeConfig) {
      await ctx.reply('❌ کانفیگ تست رایگان موجود نیست. به پشتیبانی پیام دهید.');
      return;
    }
    await ctx.reply('🎁 تست رایگان یک روزه\n\nکانفیگ زیر را کپی کنید:\n\n```\n' + freeConfig + '\n```\n\n⚠️ این تست فقط یکبار قابل استفاده است.', {
      parse_mode: 'Markdown'
    });
    db.setFreeTestUsed(userId);
  } else if (text === '📞 پشتیبانی') {
    await ctx.reply('📞 برای تماس با پشتیبانی به @Base_forever پیام دهید.');
  } else if (text === '🔙 بازگشت') {
    await ctx.reply('🏠 منوی اصلی:', {
      reply_markup: mainKeyboard()
    });
  } else if (text.indexOf('گیگ') > -1 && text.indexOf('💾') > -1) {
    var planId = null;
    if (text.indexOf('۲ گیگ') > -1) planId = '2gb';
    else if (text.indexOf('۵ گیگ') > -1) planId = '5gb';
    else if (text.indexOf('۱۰ گیگ') > -1) planId = '10gb';
    
    if (planId) {
      var cfg = db.getConfig(planId);
      if (!cfg) {
        await ctx.reply('❌ این پ
