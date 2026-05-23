import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = os.environ.get('TOKEN', '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI')
PLISIO_API_KEY = os.environ.get('PLISIO_API_KEY', 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy')
WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'https://my-vpn-bot-production.up.railway.app')
ADMIN_ID = 489450312 # آیدی تلگرام خودت

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس (برای ذخیره تست‌ها و کانفیگ‌ها)
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, has_test INTEGER DEFAULT 0)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '🎁 دریافت تست رایگان', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "خوش آمدید!", reply_markup=markup)

# --- سیستم تست رایگان ---
@bot.message_handler(func=lambda m: m.text == '🎁 دریافت تست رایگان')
def get_test(message):
    user = db.execute('SELECT has_test FROM users WHERE user_id = ?', (message.chat.id,)).fetchone()
    if user and user[0] == 1:
        bot.send_message(message.chat.id, "❌ شما قبلاً تست دریافت کرده‌اید.")
    else:
        # اینجا کد تولید کانفیگ تست ۲۰ مگابایت را اضافه کن
        bot.send_message(message.chat.id, "✅ کانفیگ تست ۲۰ مگابایتی برای شما ساخته شد: \n vmess://...")
        db.execute('INSERT OR REPLACE INTO users (user_id, has_test) VALUES (?, 1)', (message.chat.id,))
        db.commit()

# --- پنل مدیریت ---
@bot.message_handler(func=lambda m: m.text == '⚙️ پنل مدیریت' and m.chat.id == ADMIN_ID)
def admin_panel(message):
    bot.send_message(message.chat.id, "مدیریت سیستم:\n1. آمار کاربران\n2. تنظیمات درگاه")

# --- پرداخت پلسیو (بهینه شده) ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    # منطق اتصال به پلسیو که قبلاً داشتیم
    # ... (کد درخواست API در اینجا قرار می‌گیرد)

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.get_json())])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
