import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"
ADMIN_ID = 489450312
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# اتصال به دیتابیس با ساختار جدید
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, username TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER, plan TEXT, status TEXT)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    # ذخیره کاربر در دیتابیس
    db.execute('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)', (message.chat.id, message.chat.username))
    db.commit()
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    bot.send_message(message.chat.id, "سلام! به ربات خوش آمدید.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۲ گیگ - ۲$", callback_data="buy_2gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    bot.send_message(message.chat.id, "پلن خود را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    # ثبت سفارش در دیتابیس با وضعیت 'pending'
    db.execute('INSERT INTO orders (user_id, plan, status) VALUES (?, ?, ?)', (call.message.chat.id, plan, 'pending'))
    db.commit()
    
    # ساخت لینک پرداخت (مثل قبل)
    url = f"https://plisio.net/api/v1/invoices/new?api_key={PLISIO_API_KEY}&amount=2.0&currency=USDT_BSC&order_number={call.message.chat.id}"
    bot.send_message(call.message.chat.id, f"✅ برای پرداخت به لینک زیر بروید:\n{url}")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.get_json())])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
