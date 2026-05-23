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
    markup.row('🛒 خرید اشتراک', '🎁 دریافت تست رایگان')
    markup.row('📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "خوش آمدید! Vpn Mirza آماده خدمت‌رسانی است.", reply_markup=markup)

# --- خرید اشتراک ---
@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۲ گیگ - ۲$", callback_data="buy_2gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    markup.add(telebot.types.InlineKeyboardButton("۱۰ گیگ - ۹$", callback_data="buy_10gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amounts = {"2gb": "2.0", "5gb": "4.0", "10gb": "9.0"}
    payload = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amounts.get(plan, "2.0"),
        "order_number": f"{call.message.chat.id}_{plan}",
        "order_name": f"VPN_{plan}",
        "callback_url": "https://google.com"
    }
    res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload)
    if res.status_code == 200:
        url = res.json()['data']['invoice_url']
        bot.send_message(call.message.chat.id, f"✅ برای پرداخت روی لینک زیر کلیک کنید:\n{url}")
    else:
        bot.send_message(call.message.chat.id, "❌ خطا در اتصال به درگاه.")

# --- تست رایگان ---
@bot.message_handler(func=lambda m: m.text == '🎁 دریافت تست رایگان')
def get_test(message):
    user = db.execute('SELECT has_test FROM users WHERE user_id = ?', (message.chat.id,)).fetchone()
    if user and user[0] == 1:
        bot.send_message(message.chat.id, "❌ شما قبلاً تست دریافت کرده‌اید.")
    else:
        # اینجا بعداً لینک کانفیگ واقعی را بگذار
        test_link = "vmess://کانفیگ_تست_۲۰_مگ"
        db.execute('INSERT INTO services (user_id, plan, link) VALUES (?, ?, ?)', (message.chat.id, 'تست', test_link))
        db.execute('INSERT OR REPLACE INTO users (user_id, has_test) VALUES (?, 1)', (message.chat.id, 1))
        db.commit()
        bot.send_message(message.chat.id, f"✅ کانفیگ تست ساخته شد:\n`{test_link}`", parse_mode='Markdown')

# --- پنل مدیریت ---
@bot.message_handler(func=lambda m: m.text
