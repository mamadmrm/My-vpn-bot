import os
import flask
import sqlite3
from threading import Thread
import telebot
from telebot import types
import requests

# تنظیمات سرور
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
Thread(target=run).start()

API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'
bot = telebot.TeleBot(API_TOKEN)

# انبار کانفیگ‌ها
configs_pool = {"1gb": [], "3gb": [], "5gb": []}
PRICES = {"1gb": 1.0, "3gb": 2.5, "5gb": 4.0}

# تنظیم دیتابیس
def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS user_configs 
                 (user_id INTEGER, plan TEXT, config_link TEXT)''')
    conn.commit()
    conn.close()

init_db()

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("🔑 خرید کانفیگ"), types.KeyboardButton("📢 اطلاعیه‌ها"))
    markup.add(types.KeyboardButton("📁 کانفیگ‌های من"), types.KeyboardButton("⚙️ ادمین"))
    bot.send_message(message.chat.id, "خوش آمدید!", reply_markup=markup)

@bot.message_handler(func=lambda message: True)
def handle_menu(message):
    user_id = message.chat.id
    if message.text == "🔑 خرید کانفیگ":
        markup = types.InlineKeyboardMarkup(row_width=2)
        for key in ["1gb", "3gb", "5gb"]:
            markup.add(types.InlineKeyboardButton(f"{key.replace('gb', '')} گیگابایت - {PRICES[key]} $", callback_data=f"buy_{key}"))
        bot.send_message(user_id, "🛒 انتخاب کنید:", reply_markup=markup)
    
    elif message.text == "📁 کانفیگ‌های من":
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute("SELECT plan, config_link FROM user_configs WHERE user_id=?", (user_id,))
        rows = c.fetchall()
        conn.close()
        if not rows:
            bot.send_message(user_id, "❌ شما هنوز خریدی نداشته‌اید.")
        else:
            text = "📋 لیست کانفیگ‌های شما:\n\n"
            for row in rows:
                text += f"پلن: {row[0]}\nلینک: `{row[1]}`\n\n"
            bot.send_message(user_id, text, parse_mode="Markdown")

    elif message.text == "⚙️ ادمین" and user_id == 489450312: # جایگذاری ID خودت
        bot.send_message(user_id, "ادمین عزیز، برای افزودن کانفیگ از دستور /add [plan] [config] استفاده کن.")

@bot.message_handler(commands=['add'])
def add_config(message):
    if message.chat.id == 489450312:
        parts = message.text.split(" ", 2)
        plan, config = parts[1], parts[2]
        configs_pool[plan].append(config)
        bot.send_message(message.chat.id, f"✅ کانفیگ برای {plan} اضافه شد.")

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def buy_plan(call):
    plan = call.data.split("_")[1]
    if not configs_pool[plan]:
        bot.answer_callback_query(call.id, "⚠️ موجودی این پلن تمام شده است!")
        return
        
    # ساخت فاکتور... (همان کد قبلی)
    # بعد از تایید پرداخت توسط کاربر:
    config = configs_pool[plan].pop(0)
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute("INSERT INTO user_configs VALUES (?, ?, ?)", (call.message.chat.id, plan, config))
    conn.commit()
    conn.close()
    bot.send_message(call.message.chat.id, f"🎉 پرداخت موفق! کانفیگ شما:\n`{config}`", parse_mode="Markdown")

bot.infinity_polling()
