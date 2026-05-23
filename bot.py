import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"
ADMIN_ID = 489450312

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, has_test INTEGER DEFAULT 0)')
db.execute('CREATE TABLE IF NOT EXISTS services (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '🎁 دریافت تست رایگان', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام! به ربات VPN خوش آمدید.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🎁 دریافت تست رایگان')
def get_test(message):
    user = db.execute('SELECT has_test FROM users WHERE user_id = ?', (message.chat.id,)).fetchone()
    if user and user[0] == 1:
        bot.send_message(message.chat.id, "❌ شما قبلاً تست رایگان دریافت کرده‌اید.")
    else:
        test_link = "vmess://کانفیگ_تست_شما"
        db.execute('INSERT INTO services (user_id, plan, link) VALUES (?, ?, ?)', (message.chat.id, 'تست رایگان', test_link))
        db.execute('INSERT OR REPLACE INTO users (user_id, has_test) VALUES (?, 1)', (message.chat.id, 1))
        db.commit()
        bot.send_message(message.chat.id, f"✅ کانفیگ تست برای شما ساخته شد:\n`{test_link}`", parse_mode='Markdown')

@bot.message_handler(func=lambda m: m.text == '📁 سرویس‌های من')
def my_services(message):
    services = db.execute('SELECT plan, link FROM services WHERE user_id = ?', (message.chat.id,)).fetchall()
    if not services:
        bot.send_message(message.chat.id, "⚠️ هیچ سرویس فعالی پیدا نشد.")
    else:
        for s in services:
            bot.send_message(message.chat.id, f"پلن: {s[0]}\nلینک: `{s[1]}`", parse_mode='Markdown')

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_update = request.get_json()
    bot.process_new_updates([telebot.types.Update.de_json(json_update)])
    return "OK", 200

@app.route('/')
def home():
    return "Bot is running"

if __name__ == "__main__":
    # تنظیم مجدد وب‌هوک در هر بار اجرا
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
