const { Bot, Keyboard } = require('grammy');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

// ============ Plisio Payment ============
async function createPlisioInvoice(amount, userId, planId) {
  const response = await fetch('https://plisio.net/api/v1/invoices/new', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.plisioSecret}`
    },
    body: JSON.stringify({
      amount: amount,
      currency: 'USD',
      order_number: `${userId}_${planId}_${Date.now()}`,
      order_name: `VPN Plan ${planId}`,
      callback_url: `https://my-vpn-bot-production.up.railway.app/webhook?userId=${userId}&planId=${planId}`,
      redirect_url: `https://t.me/${bot.bot.username}`
    })
  });
  return response.json();
}

// ============ Commands ============
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  
  db.createUser(userId, username, firstName);
  
  const text = `🎉 *به ربات فروش VPN خوش آمدید!*

لطفا یکی از گزینه‌های زیر را انتخاب کنید:`;
  
  await ctx.reply(text, {
    reply_markup: mainKeyboard(),
    parse_mode: 'Markdown'
  });
});

bot.command('admin', async (ctx) => {
  if (ctx.from.id !== config.adminId) {
    return ctx.reply('⛔️ دسترسی غیرمجاز');
  }
  
  await ctx.reply('⚙️ *پنل مدیریت*', {
    reply_markup: adminKeyboard(),
    parse_mode: 'Markdown'
  });
});

// ============ Buttons ============
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  
  // خرید اشتراک
  if (text === '🛒 خرید اشتراک') {
    await ctx.reply('💰 *لطفا پلن مورد نظر را انتخاب کنید:*', {
      reply_markup: planKeyboard(),
      parse_mode: 'Markdown'
    });
  }
  
  // سرویس‌های من
  else if (text === '📦 سرویس‌های من') {
    const user = db.getUser(userId);
    if (!user || user.purchases.length === 0) {
      await ctx.reply('❌ شما هنوز اشتراکی خریداری نکرده‌اید!');
      return;
    }
    
    let msg = '📦 *سرویس‌های شما:*\n\n';
    user.purchases.forEach((purchase, index) => {
      const plan = config.plans.find(p => p.id === purchase.planId);
      msg += `${index + 1}. ${plan.name}\n`;
      msg += `⏰ انقضا: ${new Date(purchase.expireDate).toLocaleDateString('fa-IR')}\n`;
      msg += `\`\`\`\n${purchase.config}\n\`\`\`\n`;
    });
    
    await ctx.reply(msg, {
      parse_mode: 'Markdown'
    });
  }
  
  // تست رایگان
  else if (text === '🎁 تست رایگان') {
    const user = db.getUser(userId);
    
    if (user && user.hasFreeTest) {
      await ctx.reply('❌ شما قبلا از تست رایگان استفاده کرده‌اید!');
      return;
    }
    
    const freeConfig = db.getConfig('freeTest') || config.freeTestConfig;
    
    await ctx.reply(`🎁 *تست رایگان یک روزه*

کانفیگ زیر را کپی کنید:

\`\`\`\n${freeConfig}\n\`\`\`

⚠️ این تست فقط یکبار قابل استفاده است.`, {
      parse_mode: 'Markdown'
    });
    
    db.setFreeTestUsed(us…
