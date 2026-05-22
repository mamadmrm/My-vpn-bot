import os
import flask
from threading import Thread
import telebot
from telebot import types
import requests

# تنظیم سرور
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
Thread(target=run).start()

# تنظیمات
API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'
bot = telebot.TeleBot(API_TOKEN)

PRICES = {"1gb": 1.0, "3gb": 2.5, "5gb": 4.0}

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("🔑 خرید کانفیگ"))
    bot.send_message(message.chat.id, "خوش آمدید!", reply_markup=markup)

@bot.message_handler(func=lambda message: message.text == "🔑 خرید کانفیگ")
def show_plans(message):
    markup = types.InlineKeyboardMarkup(row_width=2)
    markup.add(types.InlineKeyboardButton("🛍️ محصول", callback_data="none"), 
               types.InlineKeyboardButton("💵 مبلغ", callback_data="none"))
    for key in ["1gb", "3gb", "5gb"]:
        label = f"{key.replace('gb', '')} گیگابایت"
        markup.add(types.InlineKeyboardButton(label, callback_data=f"buy_{key}"),
                   types.InlineKeyboardButton(f"{PRICES[key]} $", callback_data=f"buy_{key}"))
    bot.send_message(message.chat.id, "🛒 لطفاً انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def buy_plan(call):
    plan = call.data.split("_")[1]
    bot.answer_callback_query(call.id, "⏳ در حال ساخت فاکتور...")
    
    # درخواست به پلسیو
    url = "https://plisio.net/api/v1/invoices/new"
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "order_number": os.urandom(4).hex(),
        "amount": str(PRICES[plan]),
        "source_currency": "USD",
        "callback_url": "https://t.me/Vpn_mirza_bot"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        res = response.json()
        
        if res.get('status') == 'success':
            invoice_url = res['data']['invoice_url']
            markup = types.InlineKeyboardMarkup()
            markup.add(types.InlineKeyboardButton("💳 پرداخت آنلاین", url=invoice_url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} ساخته شد:", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, f"❌ خطا: {res.get('data', {}).get('message', 'خطای ناشناخته')}")
    except Exception as e:
        bot.send_message(call.message.chat.id, "❌ خطا در اتصال به درگاه. دوباره تلاش کنید.")

bot.infinity_polling()
