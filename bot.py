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
    if message.chat.id == ADMIN_ID:
        markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام! به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۱ گیگ - ۱$", callback_data="buy_1gb"))
    markup.add(telebot.types.InlineKeyboardButton("۳ گیگ - ۲.۵$", callback_data="buy_3gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amount = "1.0" if plan == "1gb" else ("2.5" if plan == "3gb" else "4.0")
    try:
        res = requests.post("https://plisio.net/api/v1/invoices/new", data={
            "api_key": PLISIO_API_KEY,
            "currency": "USDT_BSC",
            "amount": amount,
            "order_number": str(call.message.chat.id) + "_" + plan,
            "order_name": "VPN_" + plan,
            "callback_url": WEBHOOK_URL + "callback"
        }, timeout=10).json()
        if res.get('status') == 'success':
            bot.send_message(call.message.chat.id, f"✅ فاکتور ساخته شد:\n{res['data']['invoice_url']}")
        else:
            bot.send_message(call.message.chat.id, "❌ خطای درگاه.")
    except Exception:
        bot.send_message(call.message.chat.id, "❌ خطای سرور.")

@bot.message_handler(func=lambda m: m.text == '📁 سرویس‌های من')
def my_services(message):
    configs = db.execute("SELECT plan, link FROM user_configs WHERE user_id=?", (message.chat.id,)).fetchall()
    bot.send_message(message.chat.id, "\n".join([f"• {p}: {l}" for p, l in configs]) if configs else "⚠️ سرویسی ندارید.")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    update = telebot.types.Update.de_json(request.stream.read().decode('utf-8'))
    bot.process_new_updates([update])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
