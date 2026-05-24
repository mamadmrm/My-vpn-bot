const { Bot, Keyboard, InlineKeyboard } = require('grammy');
const express = require('express');

const db = require('./database');
const config = require('./config.json');

const bot = new Bot(config.botToken);
const app = express();
app.use(express.json());

function mainKeyboard() {
  return Keyboard.from([
    [{ text: 'خرید اشتراک' }, { text: 'سرویس‌های من' }],
    [{ text: 'تست رایگان' }, { text: 'پشتیبانی' }]
  ]).resized();
}

function planKeyboard() {
  return Keyboard.from([
    [{ text: '2 گیگ - 340 هزار تومان' }],
    [{ text: '5 گیگ - 800 هزار تومان' }],
    [{ text: '10 گیگ - 1500000 تومان' }],
    [{ text: 'بازگشت' }]
  ]).resized();
}

function adminKeyboard() {
  var ikb = new InlineKeyboard();
  ikb.text('🔴 کانفیگ 2 گیگ', 'cfg_2gb').row();
  ikb.text('🔴 کانفیگ 5 گیگ', 'cfg_5gb').row();
  ikb.text('🔴 کانفیگ 10 گیگ', 'cfg_10gb').row();
  ikb.text('🔴 کانفیگ تست رایگان', 'cfg_free').row();
  ikb.text('👥 لیست کاربران', 'users').row();
  ikb.text('📊 آمار', 'stats');
  return ikb;
}

bot.command('start', async function(ctx) {
  var userId = ctx.from.id;
  var username = ctx.from.username || 'unknown';
  var firstName = ctx.from.first_name || 'User';
  
  db.createUser(userId, username, firstName);
  
  await ctx.reply('به ربات فروش VPN خوش آمدید!', {
    reply_markup: mainKeyboard()
  });
});

bot.command('admin', async function(ctx) {
  if (ctx.from.id != config.adminId) {
    await ctx.reply('دسترسی غیرمجاز');
    return;
  }
  
  await ctx.reply('پنل مدیریت:', {
    reply_markup: adminKeyboard()
  });
});

bot.on('callback_query', async function(ctx) {
  var callbackData = ctx.callbackQuery.data;
  var userId = ctx.from.id;
  
  if (callbackData === 'cfg_2gb') {
    await ctx.answerCallbackQuery('کانفیگ 2 گیگ را بفرستید');
    await ctx.reply('کانفیگ 2 گیگ را بفرستید:');
  } else if (callbackData === 'cfg_5gb') {
    await ctx.answerCallbackQuery('کانفیگ 5 گیگ را بفرستید');
    await ctx.reply('کانفیگ 5 گیگ را بفرستید:');
  } else if (callbackData === 'cfg_10gb') {
    await ctx.answerCallbackQuery('کانفیگ 10 گیگ را بفرستید');
    await ctx.reply('کانفیگ 10 گیگ را بفرستید:');
  } else if (callbackData === 'cfg_free') {
    await ctx.answerCallbackQuery('کانفیگ تست رایگان را بفرستید');
    await ctx.reply('کانفیگ تست رایگان را بفرستید:');
  } else if (callbackData === 'users') {
    var users = db.getAllUsers();
    await ctx.answerCallbackQuery('OK');
    await ctx.reply('کاربران: ' + users.length);
  } else if (callbackData === 'stats') {
    var users = db.getAllUsers();
    await ctx.answerCallbackQuery('OK');
    await ctx.reply('آمار: ' + users.length + ' کاربر');
  }
});

bot.on('message:text', async function(ctx) {
  var text = ctx.message.text;
  var userId = ctx.from.id;
  var isAdmin = userId == config.adminId;
  
  if (text === 'خرید اشتراک') {
    await ctx.reply('پلن را انتخاب کنید:', {
      reply_markup: planKeyboard()
    });
  } else if (text === 'سرویس‌های من') {
    var user = db.getUser(userId);
    if (!user || !user.purchases || user.purchases.length === 0) {
      await ctx.reply('اشتراکی ندارید!');
      return;
    }
    await ctx.reply('شما ' + user.purchases.length + ' اشتراک دارید.');
  } else if (text === 'تست رایگان') {
    var user = db.getUser(userId);
    if (user && user.hasFreeTest) {
      await ctx.reply('قبلا استفاده کرده‌اید!');
      return;
    }
    var freeConfig = db.getConfig('freeTest') || config.freeTestConfig;
    if (!freeConfig) {
      await ctx.reply('کانفیگ موجود نیست.');
      return;
    }
    await ctx.reply('تست رایگان:\n\n' + freeConfig);
    db.setFreeTestUsed(userId);
  } else if (text === 'پشتیبانی') {
    await ctx.reply('برای تماس با پشتیبانی به @Base_forever پیام دهید.');
  } else if (text === 'بازگشت') {
    await ctx.reply('منوی اصلی:', {
      reply_markup: mainKeyboard()
    });
  } else if (text.indexOf('گیگ') > -1 && text.indexOf('کانفیگ') === -1) {
    var planId = null;
    if (text.indexOf('2 گیگ') > -1) planId = '2gb';
    else if (text.in…
