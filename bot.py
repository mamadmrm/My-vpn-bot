import os
import flask
import sqlite3
import threading
import telebot
from telebot import types
import requests

# تنظیمات اولیه
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
threading.Thread(target=run).start()

API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'
ADMIN_ID = 489450312
bot = telebot.TeleBot(API_TOKEN)

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add("🔑 خرید کانفیگ", "📢 اطلاعیه‌ها", "📁 کانفیگ‌های من")
    if message.chat.id == ADMIN_ID: markup.add("⚙️ مدیریت کانفیگ")
    bot.send_message(message.chat.id, "به Vpn Mirza خوش آمدید.", reply_markup=markup)

# مدیریت خرید و اتصال به درگاه پلسیو
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def process_buy(call):
    plan = call.data.split("_")[1]
    amount = "1.0" if plan == "1gb" else "2.5"
    
    # درخواست به پلسیو
    url = "https://plisio.net/api/v1/invoices/new"
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amount,
        "order_number": os.urandom(4).hex(),
        "order_name": f"Config_{plan}",
        "callback_url": "https://t.me/Vpn_mirza_bot"
    }
    
    try:
        res = requests.get(url, params=params, timeout=10).json()
        if res.get('status') == 'success':
            invoice_url = res['data']['invoice_url']
            markup = types.InlineKeyboardMarkup()
            markup.add(types.InlineKeyboardButton("💳 پرداخت آنلاین", url=invoice_url))
            bot.send_message(call.message.chat.id, "✅ برای پرداخت روی دکمه زیر کلیک کن:", reply_markup=markup)
            # نکته: در این روش بعد از پرداخت، خودت باید کانفیگ را دستی یا با سیستم Callback تحویل بدهی
        else:
            bot.send_message(call.message.chat.id, f"❌ خطای درگاه: {res.get('data', {}).get('message', 'Unknown')}")
    except Exception as e:
        bot.send_message(call.message.chat.id, "❌ خطای اتصال به درگاه.")

# بخش مدیریت کانفیگ (همان قبلی)
@bot.message_handler(func=lambda message: message.text == "➕ افزودن کانفیگ" and message.chat.id == ADMIN_ID)
def ask_plan(message):
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton("1 گیگ", callback_data="add_1gb"),
               types.InlineKeyboardButton("3 گیگ", callback_data="add_3gb"))
    bot.send_message(message.chat.id, "پلن را انتخاب کن:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("add_"))
def save_link_step(call):
    plan = call.data.split("_")[1]
    msg = bot.send_message(call.message.chat.id, f"لینک کانفیگ {plan} را بفرست:")
    bot.register_next_step_handler(msg, lambda m: (db.execute("INSERT INTO config_pool VALUES (?, ?)", (plan, m.text)), db.commit(), bot.send_message(m.chat.id, "✅ ذخیره شد.")))

bot.infinity_polling(none_stop=True)
