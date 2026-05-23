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

# ایجاد دیتابیس
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
    bot.send_message(message.chat.id, "سلام! ربات Vpn Mirza در خدمت شماست.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۲ گیگ - ۲$", callback_data="buy_2gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    markup.add(telebot.types.InlineKeyboardButton("۱۰ گیگ - ۹$", callback_data="buy_10gb"))
    bot.send_message(message.chat.id, "پلن خود را انتخاب کنید:", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🎁 دریافت تست رایگان')
def get_test(message):
    user = db.execute('SELECT has_test FROM users WHERE user_id = ?', (message.chat.id,)).fetchone()
    if user and user[0] == 1:
        bot.send_message(message.chat.id, "❌ شما قبلاً تست دریافت کردید.")
    else:
        test_link = "vmess://تست_۲۰_مگابایتی"
        db.execute('INSERT INTO services (user_id, plan, link) VALUES (?, ?, ?)', (message.chat.id, 'تست', test_link))
        db.execute('INSERT OR REPLACE INTO users (user_id, has_test) VALUES (?, 1)', (message.chat.id, 1))
        db.commit()
        bot.send_message(message.chat.id, f"✅ کانفیگ تست:\n`{test_link}`", parse_mode='Markdown')

@bot.message_handler(func=lambda m: m.text == '📁 سرویس‌های من')
def my_services(message):
    services = db.execute('SELECT plan, link FROM services WHERE user_id = ?', (message.chat.id,)).fetchall()
    if not services:
        bot.send_message(message.chat.id, "⚠️ هیچ سرویسی ندارید.")
    else:
        for s in services: bot.send_message(message.chat.id, f"پلن: {s[0]}\nلینک: `{s[1]}`", parse_mode='Markdown')

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amounts = {"2gb": "2.0", "5gb": "4.0", "10gb": "9.0"}
    payload = {"api_key": PLISIO_API_KEY, "currency": "USDT_BSC", "amount": amounts.get(plan, "2.0"), "order_number": str(call.message.chat.id), "order_name": f"VPN_{plan}", "callback_url": "https://google.com"}
    res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload)
    if res.status_code == 200:
        bot.send_message(call.message.chat.id, f"💳 پرداخت: {res.json()['data']['invoice_url']}")

@bot.message_handler(func=lambda m: m.text == '⚙️ پنل مدیریت' and m.chat.id == ADMIN_ID)
def admin(message):
    count = db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    bot.send_message(message.chat.id, f"📊 تعداد کل کاربران: {count}")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.get_json())])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
