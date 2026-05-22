import os
import flask
import sqlite3
import threading
import telebot
from telebot import types
import requests

# 1. تنظیمات سرور (برای رندر)
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
threading.Thread(target=run).start()

# 2. تنظیمات ربات
API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
bot = telebot.TeleBot(API_TOKEN)

# 3. دیتابیس (استفاده از حالت ساده)
def get_db():
    conn = sqlite3.connect('database.db', check_same_thread=False)
    return conn

# ساخت جداول اگر نباشند
db = get_db()
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# 4. پیام شروع
@bot.message_handler(commands=['start'])
def start(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add("🔑 خرید کانفیگ", "📢 اطلاعیه‌ها", "📁 کانفیگ‌های من")
    if message.chat.id == ADMIN_ID:
        markup.add("⚙️ مدیریت کانفیگ")
    bot.send_message(message.chat.id, "به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

# 5. اطلاعیه
@bot.message_handler(func=lambda message: message.text == "📢 اطلاعیه‌ها")
def announcement(message):
    bot.send_message(message.chat.id, "📢 **وضعیت سرورها:**\nسرورها در حال بهینه‌سازی هستند. ممکن است قطعی‌های لحظه‌ای داشته باشیم.")

# 6. مدیریت کانفیگ (دکمه‌ای)
@bot.message_handler(func=lambda message: message.text == "⚙️ مدیریت کانفیگ" and message.chat.id == ADMIN_ID)
def admin_menu(message):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add("➕ افزودن کانفیگ", "🔙 بازگشت")
    bot.send_message(message.chat.id, "مدیریت کانفیگ:", reply_markup=markup)

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
    bot.register_next_step_handler(msg, lambda m: save_to_db(m, plan))

def save_to_db(message, plan):
    db.execute("INSERT INTO config_pool VALUES (?, ?)", (plan, message.text))
    db.commit()
    bot.send_message(message.chat.id, "✅ ذخیره شد.")

# 7. خرید (ساده شده)
@bot.message_handler(func=lambda message: message.text == "🔑 خرید کانفیگ")
def buy_menu(message):
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton("خرید 1 گیگ - 1$", callback_data="buy_1gb"),
               types.InlineKeyboardButton("خرید 3 گیگ - 2.5$", callback_data="buy_3gb"))
    bot.send_message(message.chat.id, "پلن خود را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def process_buy(call):
    plan = call.data.split("_")[1]
    cur = db.execute("SELECT rowid, link FROM config_pool WHERE plan=? LIMIT 1", (plan,))
    data = cur.fetchone()
    if not data:
        bot.answer_callback_query(call.id, "⚠️ موجودی تمام شده!")
    else:
        bot.send_message(call.message.chat.id, f"✅ کانفیگ شما:\n`{data[1]}`", parse_mode="Markdown")
        db.execute("DELETE FROM config_pool WHERE rowid=?", (data[0],))
        db.commit()

bot.infinity_polling(none_stop=True)
