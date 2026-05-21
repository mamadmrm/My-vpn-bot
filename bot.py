import os
import flask
from threading import Thread
import telebot
from telebot import types
import requests

app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
Thread(target=run).start()

API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
bot = telebot.TeleBot(API_TOKEN)
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

PRICES = {"1gb": 1.0, "3gb": 2.5, "5gb": 4.0}
configs_pool = {"1gb": [], "3gb": [], "5gb": []}

def create_plisio_invoice(amount, plan_name):
    url = "https://plisio.net/api/v1/invoices/new"
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "order_number": os.urandom(4).hex(),
        "order_name": f"خرید {plan_name}",
        "amount": str(amount),
        "source_currency": "USD",
        "callback_url": "https://t.me/Vpn_mirza_bot"
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        return response.json()
    except:
        return None

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("🔑 خرید کانفیگ"))
    bot.send_message(message.chat.id, "خوش آمدید!", reply_markup=markup)

@bot.message_handler(func=lambda message: True)
def handle_messages(message):
    if message.text == "🔑 خرید کانفیگ":
        markup = types.InlineKeyboardMarkup(row_width=2)
        markup.add(types.InlineKeyboardButton("🛍️ محصول", callback_data="none"), 
                   types.InlineKeyboardButton("💵 مبلغ", callback_data="none"))
        for key in ["1gb", "3gb", "5gb"]:
            label = f"{key.replace('gb', '')} گیگابایت"
            markup.add(types.InlineKeyboardButton(label, callback_data=f"buy_{key}"),
                       types.InlineKeyboardButton(f"{PRICES[key]} $", callback_data=f"buy_{key}"))
        bot.send_message(message.chat.id, "🛒 محصول را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: True)
def callback_query(call):
    if call.data.startswith("buy_"):
        plan = call.data.split("_")[1]
        bot.answer_callback_query(call.id, "⏳ در حال ساخت فاکتور...")
        
        res = create_plisio_invoice(PRICES[plan], plan)
        if res and res.get('status') == 'success':
            url = res['data']['invoice_url']
            markup = types.InlineKeyboardMarkup()
            markup.add(types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور ساخته شد.\nمبلغ: {PRICES[plan]} دلار", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, "❌ خطا در ساخت فاکتور.")

bot.infinity_polling()
