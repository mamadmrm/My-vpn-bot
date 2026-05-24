const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const axios = require('axios');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const bot = new TelegramBot(config.botToken, { polling: true });

const API_KEY = config.nowPaymentsApiKey;
const ADMIN_ID = config.adminId;

// ذخیره پرداخت‌ها
let payments = {};

// شروع /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  bot.sendMessage(chatId, '👋 سلام! به ربات خوش اومدی.\n\nبرای خرید کانفیگ، دکمه زیر رو بزن:', {
    reply_markup: {
      keyboard: [[{ text: '🛒 خرید کانفیگ' }]],
      resize_keyboard: true
    }
  });
});

// دکمه خرید
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text === '🛒 خرید کانفیگ') {
    showPlans(chatId);
  }
});

function showPlans(chatId) {
  const plans = [
    { name: '🌐 پروکسی 1 ماهه', price: 5, id: 'proxy_1m' },
    { name: '🌐 پروکسی 3 ماهه', price: 12, id: 'proxy_3m' },
    { name: '🌐 پروکسی 6 ماهه', price: 20, id: 'proxy_6m' }
  ];
  
  let keyboard = plans.map(p => [{ text: `${p.name} - ${p.price}$` }]);
  
  bot.sendMessage(chatId, '💰 لیست پلن‌ها:', {
    reply_markup: { keyboard, resize_keyboard: true }
  });
}

// وقتی پلن رو انتخاب می‌کنه
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  
  const plans = {
    'پروکسی 1 ماهه - 5$': { price: 5, id: 'proxy_1m' },
    'پروکسی 3 ماهه - 12$': { price: 12, id: 'proxy_3m' },
    'پروکسی 6 ماهه - 20$': { price: 20, id: 'proxy_6m' }
  };
  
  if (plans[text]) {
    const plan = plans[text];
    await createPayment(chatId, userId, plan);
  }
});

async function createPayment(chatId, userId, plan) {
  try {
    // ساخت پرداخت در NowPayments
    const response = await axios.post('https://api.nowpayments.io/v1/payment', {
      price_amount: plan.price,
      price_currency: 'usd',
      order_id: `user_${userId}_${Date.now()}`,
      order_description: plan.id,
      ipn_callback_url: 'https://your-domain.com/webhook'
    }, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const payment = response.data;
    payments[payment.payment_id] = {
      userId,
      chatId,
      plan: plan.id,
      amount: plan.price,
      status: 'waiting',
      created: Date.now()
    };
    
    // ارسال لینک پرداخت
    bot.sendMessage(chatId, `💳 لینک پرداخت:\n\n${payment.payment_url}\n\n⏰ این لینک 20 دقیقه اعتبار داره.`, {
      reply_markup: {
        inline_keyboard: [[{ text: '💰 پرداخت کردم', callback_data: `check_${payment.payment_id}` }]]
      }
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ مشکلی پیش اومد. دوباره تلاش کن.');
  }
}

// دکمه بررسی پرداخت
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data.startsWith('check_')) {
    const paymentId = data.replace('check_', '');
    await checkPayment(chatId, paymentId);
  }
});

async function checkPayment(chatId, paymentId) {
  try {
    const response = await axios.get(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const payment = response.data;
    
    if (payment.payment_status === 'confirmed' || payment.payment_status === 'finished') {
      // پرداخت موفق!
      const userPayment = payments[paymentId];
      
      bot.sendMessage(chatId, '✅ پرداخت موفق بود! 🎉\n\nکانفیگ شما:\n\n```yaml\nserver: proxy.example.com\nport: 443\nusername: user123\npassword: pass456\n```', { parse_mode: 'Markdown' });
      
      // خبر دادن به ادمین
      bot.sendMessage(ADMIN_ID, `💰 پرداخت جدید!\nکاربر: ${userPayment.userId}\nمبلغ: ${userPayment.amount}$\nپلن: ${userPayment.plan}`);
      
    } else {
      bot.sendMessage(chatId, '⏳ هنوز پرداخت تأیید نشده. لطفاً صبر کن و دوباره تلاش کن.');
    }
    
  } catch (error) {
    console.error('Error:', erro…
