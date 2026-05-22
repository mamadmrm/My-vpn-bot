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

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# --- منوی شروع ---
@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    bot.send_message(message.chat.id, "سلام! به Vpn Mirza خوش آمدید.", reply_markup=markup)

# --- دکمه خرید ---
@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۱ گیگابایت - 1.0 $", callback_data="buy_1gb"))
    markup.add(telebot.types.InlineKeyboardButton("۳ گیگابایت - 2.5 $", callback_data="buy_3gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

# --- منطق درگاه پرداخت (با دکمه شیشه‌ای) ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amount = "1.0" if plan == "1gb" else "2.5"
    
    try:
        # ارسال درخواست به پلسیو
        res = requests.get("https://plisio.net/api/v1/invoices/new", params={
            "api_key": PLISIO_API_KEY,
            "currency": "USDT_BSC",
            "amount": amount,
            "order_number": str(call.message.chat.id),
            "order_name": "VPN_" + plan
        }, timeout=15).json()
        
        if res.get('status') == 'success':
            url = res['data']['invoice_url']
            markup = telebot.types.InlineKeyboardMarkup()
            markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} ساخته شد.", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, "❌ خطای درگاه. لطفا دوباره تلاش کنید.")
    except Exception as e:
        bot.send_message(call.message.chat.id, "❌ خطای شبکه. پلسیو در دسترس نیست.")

# --- وب‌هوک Flask ---
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    update = telebot.types.Update.de_json(request.stream.read().decode('utf-8'))
    bot.process_new_updates([update])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
