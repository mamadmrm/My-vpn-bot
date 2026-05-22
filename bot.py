import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
WEBHOOK_URL = "https://my-vpn-bot-wt0a.onrender.com/"
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام، به ربات فروش کانفیگ خوش آمدید.", reply_markup=markup)

# --- سیستم خرید و درگاه ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def process_buy(call):
    plan = call.data.split("_")[1]
    amount = "1.0" if plan == "1gb" else ("2.5" if plan == "3gb" else "4.0")
    
    # اتصال به درگاه پلسیو
    try:
        res = requests.get("https://plisio.net/api/v1/invoices/new", params={
            "api_key": PLISIO_API_KEY, "currency": "USDT_BSC", "amount": amount,
            "order_number": str(call.message.chat.id) + "_" + plan, "order_name": "VPN_" + plan
        }).json()
        
        if res['status'] == 'success':
            url = res['data']['invoice_url']
            bot.send_message(call.message.chat.id, f"✅ فاکتور ساخته شد. برای پرداخت کلیک کنید:\n{url}")
        else:
            bot.send_message(call.message.chat.id, "❌ خطای درگاه. لطفا بعداً تلاش کنید.")
    except:
        bot.send_message(call.message.chat.id, "❌ خطای ارتباط با سرور پرداخت.")

# --- سرویس‌های من ---
@bot.message_handler(func=lambda m: m.text == '📁 سرویس‌های من')
def my_services(message):
    configs = db.execute("SELECT plan, link FROM user_configs WHERE user_id=?", (message.chat.id,)).fetchall()
    if not configs:
        bot.send_message(message.chat.id, "⚠️ متاسفانه سرویس فعالی برای شما یافت نشد.")
    else:
        text = "📁 سرویس‌های شما:\n"
        for p, l in configs: text += f"• پلن {p}: `{l}`\n"
        bot.send_message(message.chat.id, text, parse_mode="Markdown")

# --- مدیریت ---
@bot.message_handler(func=lambda m: m.text == '⚙️ پنل مدیریت' and m.chat.id == ADMIN_ID)
def admin_menu(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add('➕ افزودن کانفیگ', '🔙 بازگشت')
    bot.send_message(message.chat.id, "پنل مدیریت:", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '➕ افزودن کانفیگ')
def ask_p(message):
    msg = bot.send_message(message.chat.id, "فرمت: [1gb/3gb/5gb] [لینک]")
    bot.register_next_step_handler(msg, lambda m: (db.execute("INSERT INTO config_pool VALUES (?, ?)", m.text.split(" ")), db.commit(), bot.send_message(m.chat.id, "✅ اضافه شد.")))

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.stream.read().decode('utf-8'))])
    return "OK", 200

if __name__ == "__main__":
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
