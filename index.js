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
    [{ text: '2 گیگ - 2 دلار' }],
    [{ text: '5 گیگ - 4 دلار' }],
    [{ text: '10 گیگ - 9 دلار' }],
    [{ text: 'بازگشت' }]
  ]).resized();
}

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'unknown';
  const firstName = ctx.from.first_name || 'User';
  
  db.createUser(userId, username, firstName);
  
  await ctx.reply('به ربات فروش VPN خوش آمدید!', {
    reply_markup: mainKeyboard()
  });
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  
  if (text === 'خرید اشتراک') {
    await ctx.reply('پلن مورد نظر را انتخاب کنید:', {
      reply_markup: planKeyboard()
    });
  }
  
  else if (text === 'سرویس‌های من') {
    const user = db.getUser(userId);
    if (!user || !user.purchases || user.purchases.length === 0) {
      await ctx.reply('هنوز اشتراکی خریداری نکرده‌اید!');
      return;
    }
    await ctx.reply('سرویس‌های شما: ' + user.purchases.length);
  }
  
  else if (text === 'تست رایگان') {
    const user = db.getUser(userId);
    if (user && user.hasFreeTest) {
      await ctx.reply('قبلا از تست رایگان استفاده کرده‌اید!');
      return;
    }
    const freeConfig = db.getConfig('freeTest') || 'free-test-config';
    await ctx.reply('تست رایگان:\n\n' + freeConfig);
    db.setFreeTestUsed(userId);
  }
  
  else if (text === 'پشتیبانی') {
    await ctx.reply('به @admin پیام دهید.');
  }
  
  else if (text === 'بازگشت') {
    await ctx.reply('منوی اصلی', {
      reply_markup: mainKeyboard()
    });
  }
});

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});

bot.start();
console.log('Bot started!');
