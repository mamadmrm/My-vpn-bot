const { Bot, Keyboard } = require('grammy');
const express = require('express');

const db = require('./database');
const config = require('./config.json');

const bot = new Bot(config.botToken);
const app = express();
app.use(express.json());

var paymentLinks = {};
var paymentTimes = {};

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

bot.command('start', async function(ctx) {
  var userId = ctx.from.id;
  var username = ctx.from.username || 'unknown';
  var firstName = ctx.from.first_name || 'User';
  
  db.createUser(userId, username, firstName);
  
  await ctx.reply('به ربات فروش VPN خوش آمدید!', {
    reply_markup: mainKeyboard()
  });
});

bot.on('message:text', async function(ctx) {
  var text = ctx.message.text;
  var userId = ctx.from.id;
  var now = Date.now();
  
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
  } else if (text.indexOf('2 گیگ') > -1) {
    paymentLinks[userId] = 'https://nowpayments.io/payment/?iid=5737010457';
    paymentTimes[userId] = now;
    await ctx.reply('💰 پلن 2 گیگ - 340 هزار تومان\n\nبرای پرداخت روی لینک زیر کلیک کنید:\n\nhttps://nowpayments.io/payment/?iid=5737010457\n\n⚠️ این لینک 20 دقیقه اعتبار دارد.');
  } else if (text.indexOf('5 گیگ') > -1) {
    paymentLinks[userId] = 'https://nowpayments.io/payment/?iid=6268245939';
    paymentTimes[userId] = now;
    await ctx.reply('💰 پلن 5 گیگ - 800 هزار تومان\n\nبرای پرداخت روی لینک زیر کلیک کنید:\n\nhttps://nowpayments.io/payment/?iid=6268245939\n\n⚠️ این لینک 20 دقیقه اعتبار دارد.');
  } else if (text.indexOf('10 گیگ') > -1) {
    paymentLinks[userId] = 'https://nowpayments.io/payment/?iid=5014091528';
    paymentTimes[userId] = now;
    await ctx.reply('💰 پلن 10 گیگ - 1,500,000 تومان\n\nبرای پرداخت روی لینک زیر کلیک کنید:\n\nhttps://nowpayments.io/payment/?iid=5014091528\n\n⚠️ این لینک 20 دقیقه اعتبار دارد.');
  } else if (text === 'بررسی پرداخت' || text === 'فعالسازی') {
    if (!paymentLinks[userId]) {
      await ctx.reply('لینک پرداختی ندارید. ابتدا اشتراک بخرید.');
      return;
    }
    var elapsed = (now - paymentTimes[userId]) / 1000 / 60;
    if (elapsed > 20) {
      await ctx.reply('❌ لینک پرداخت منقضی شده است. لطفا دوباره خرید کنید.');
      delete paymentLinks[userId];
      delete paymentTimes[userId];
      return;
    }
    await ctx.reply('⏳ لطفا صبر کنید...');
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
