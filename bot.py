import os
import flask
from threading import Thread
import telebot
from telebot import types
import requests

# تنظیمات سرور برای رندر
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
Thread(target=run).start()

# اطلاعات ربات
API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
bot = telebot.TeleBot(API_TOKEN) # اینجا تعریف شد و مشکل NameError حل می‌شود

ADMIN_ID = 489450312
PRICES = {"1gb": 1.0, "3gb": 2.5, "5gb": 4.0}
configs_pool = {"1gb": [], "3gb": [], "5gb": []}
user_steps = {}

# منوی اصلی
@bot.message_handler(commands=['start'])
def send_welcome(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("🔑 خرید کانفیگ"))
    bot.send_message(message.chat.id, "به ربات خوش آمدید:", reply_markup=markup)

# مدیریت دکمه‌های خرید مدل جدولی
@bot.message_handler(func=lambda message: True)
def handle_messages(message):
    if message.text == "🔑 خرید کانفیگ":
        markup = types.InlineKeyboardMarkup(row_width=2)
        # دکمه‌های نمایشی
        markup.add(types.InlineKeyboardButton("🛍️ محصول", callback_data="none"), 
                   types.InlineKeyboardButton("💵 مبلغ", callback_data="none"))
        # دکمه‌های خرید
        for key in ["1gb", "3gb", "5gb"]:
            label = "۱ گیگابایت" if key == "1gb" else ("۳ گیگابایت" if key == "3gb" else "۵ گیگابایت")
            markup.add(types.InlineKeyboardButton(label, callback_data=f"buy_{key}"),
                       types.InlineKeyboardButton(f"{PRICES[key]} $", callback_data=f"buy_{key}"))
        
        bot.send_message(message.chat.id, "🛒 لطفاً محصول مورد نظر را انتخاب کنید:", reply_markup=markup)

# هندلر کال‌بک‌ها
@bot.callback_query_handler(func=lambda call: True)
def callback_inline(call):
    if call.data.startswith("buy_"):
        bot.answer_callback_query(call.id, "در حال اتصال به درگاه...")
        # منطق درگاه اینجا قرار می‌گیرد
        bot.send_message(call.message.chat.id, f"در حال پردازش خرید {call.data}...")

bot.infinity_polling()
