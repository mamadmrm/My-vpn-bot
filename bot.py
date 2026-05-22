import os
import flask
import sqlite3
import threading
import telebot
from telebot import types
import requests

# تنظیمات سرور
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
threading.Thread(target=run).start()

API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312 
bot = telebot.TeleBot(API_TOKEN)

# دیتابیس
conn = sqlite3.connect('database.db', check_same_thread=False)
c = conn.cursor()
c.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
c.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
conn.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add("🔑 خرید کانفیگ", "📢 اطلاعیه‌ها")
    markup.add("📁 کانفیگ‌های من")
    if message.chat.id == ADMIN_ID:
        markup.add("⚙️ مدیریت کانفیگ")
    bot.send_message(message.chat.id, "به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

@bot.message_handler(func=lambda message: message.text == "📢 اطلاعیه‌ها")
def announcement(message):
    bot.send_message(message.chat.id, "📢 **اطلاعیه وضعیت سرورها**\n\nکاربران گرامی، سرورهای ما به صورت شبانه‌روزی تحت نظارت و در حال بروزرسانی هستند. ممکن است در برخی ساعات برای بهبود کیفیت و سرعت، قطعی‌های لحظه‌ای داشته باشیم. از شکیبایی شما سپاسگزاریم.")

@bot.message_handler(func=lambda message: message.text == "⚙️ مدیریت کانفیگ" and message.chat.id == ADMIN_ID)
def admin_menu(message):
    bot.send_message(message.chat.id, "برای افزودن کانفیگ، دستور زیر را بفرست:\n/add [plan] [link]\nمثال: /add 1gb vless://...")

@bot.message_handler(commands=['add'])
def add_config(message):
    if message.chat.id == ADMIN_ID:
        try:
            parts = message.text.split(" ", 2)
            c.execute("INSERT INTO config_pool VALUES (?, ?)", (parts[1], parts[2]))
            conn.commit()
            bot.reply_to(message, "✅ کانفیگ با موفقیت اضافه شد.")
        except:
            bot.reply_to(message, "❌ فرمت اشتباه است. از /add [plan] [link] استفاده کن.")

@bot.message_handler(func=lambda message: message.text == "🔑 خرید کانفیگ")
def buy_menu(message):
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton("1 گیگ - 1$", callback_data="buy_1gb"),
               types.InlineKeyboardButton("3 گیگ - 2.5$", callback_data="buy_3gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کن:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def buy_plan(call):
    plan = call.data.split("_")[1]
    c.execute("SELECT rowid, link FROM config_pool WHERE plan=? LIMIT 1", (plan,))
    data = c.fetchone()
    if not data:
        bot.answer_callback_query(call.id, "⚠️ موجودی این پلن تمام شده!")
    else:
        # اینجا بعد از اتصال درگاه پرداخت (در نسخه بعدی) لینک داده می‌شود
        bot.send_message(call.message.chat.id, f"پرداخت را انجام دهید و رسید را بفرستید.")

bot.infinity_polling()
