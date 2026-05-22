import os
import flask
import sqlite3
from threading import Thread
import telebot
from telebot import types
import requests

# تنظیمات اولیه
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
Thread(target=run).start()

API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
bot = telebot.TeleBot(API_TOKEN)

# دیتابیس
def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)''')
    # ثبت اطلاعیه پیش‌فرض اگر وجود ندارد
    c.execute("INSERT OR IGNORE INTO settings VALUES ('announcement', '📢 سرورها در حال بروزرسانی هستند.')")
    conn.commit()
    conn.close()

init_db()

@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add("🔑 خرید کانفیگ", "📢 اطلاعیه‌ها", "📁 کانفیگ‌های من")
    bot.send_message(message.chat.id, "خوش آمدید!", reply_markup=markup)

@bot.message_handler(func=lambda message: message.text == "📢 اطلاعیه‌ها")
def show_announcement(message):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key='announcement'")
    ann = c.fetchone()[0]
    conn.close()
    bot.send_message(message.chat.id, ann)

# دستور ساده برای ادمین: /add 1gb vless://...
@bot.message_handler(commands=['add'])
def add_config(message):
    if message.chat.id == 489450312: # آیدی خودت
        try:
            parts = message.text.split(" ", 2)
            plan, link = parts[1], parts[2]
            conn = sqlite3.connect('database.db')
            c = conn.cursor()
            c.execute("INSERT INTO config_pool VALUES (?, ?)", (plan, link))
            conn.commit()
            conn.close()
            bot.reply_to(message, f"✅ کانفیگ {plan} اضافه شد.")
        except:
            bot.reply_to(message, "❌ فرمت: /add 1gb [link]")

@bot.message_handler(func=lambda message: message.text == "🔑 خرید کانفیگ")
def buy_menu(message):
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton("1 گیگ - 1$", callback_data="buy_1gb"),
               types.InlineKeyboardButton("3 گیگ - 2.5$", callback_data="buy_3gb"))
    bot.send_message(message.chat.id, "پلن خود را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def process_buy(call):
    plan = call.data.split("_")[1]
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute("SELECT rowid, link FROM config_pool WHERE plan=? LIMIT 1", (plan,))
    data = c.fetchone()
    
    if not data:
        bot.answer_callback_query(call.id, "⚠️ موجودی این پلن تمام شده!")
    else:
        rowid, link = data
        c.execute("DELETE FROM config_pool WHERE rowid=?", (rowid,))
        c.execute("INSERT INTO user_configs VALUES (?, ?, ?)", (call.message.chat.id, plan, link))
        conn.commit()
        bot.send_message(call.message.chat.id, f"✅ پرداخت تایید شد! کانفیگ شما:\n`{link}`", parse_mode="Markdown")
    conn.close()

bot.infinity_polling()
