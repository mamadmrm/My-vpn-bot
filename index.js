const { Bot, Keyboard } = require('grammy');
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
    [{ text: '10 گیگ - 1,500,000 تومان' }],
    [{ text: 'بازگشت' }]
  ]).resized();
}

function adminKeyboard() {
  return Keyboard.from([
    [{ text: 'افزودن کانفیگ 2 گیگ' }],
    [{ text: 'افزودن کانفیگ 5 گیگ' }],
    [{ text: 'افزودن کانفیگ 10 گیگ' }],
    [{ text: 'افزودن کانفیگ تست رایگان' }],
    [{ text: 'لیست کاربران' }, { text: 'آمار' }],
    [{ text: 'بازگشت' }]
  ]).resized();
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
    return ctx.reply('دسترسی غیرمجاز');
  }
  
  await ctx.reply('پنل مدیریت:', {
    reply_markup: adminKeyboard()
  });
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
    await ctx.reply('به @admin پیام دهید.');
  } else if (text === 'بازگشت') {
    await ctx.reply('منوی اصلی:', {
      reply_markup: mainKeyboard()
    });
  } else if (text.indexOf('گیگ') > -1) {
    var planId = null;
    if (text.indexOf('2 گیگ') > -1) planId = '2gb';
    else if (text.indexOf('5 گیگ') > -1) planId = '5gb';
    else if (text.indexOf('10 گیگ') > -1) planId = '10gb';
    
    if (planId) {
      var cfg = db.getConfig(planId);
      if (!cfg) {
        await ctx.reply('این پلن فعال نیست.');
        return;
      }
      await ctx.reply('برای پرداخت به @admin پیام دهید.');
    }
  } else if (isAdmin) {
    if (text.indexOf('افزودن کانفیگ') > -1) {
      await ctx.reply('کانفیگ را بفرستید:');
    } else if (text === 'لیست کاربران') {
      var users = db.getAllUsers();
      await ctx.reply('کاربران: ' + users.length);
    } else if (text === 'آمار') {
      var users = db.getAllUsers();
      await ctx.reply('آمار: ' + users.length + ' کاربر');
    } else if (text.indexOf('vless://') > -1 || text.indexOf('vmess://') > -1 || text.indexOf('trojan://') > -1) {
      await ctx.reply('کانفیگ ذخیره شد!');
    }
  }
});

app.get('/', function(req, res) {
  res.send('Bot is running!');
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});

bot.start();
console.log('Bot started!');
