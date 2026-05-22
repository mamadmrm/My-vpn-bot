import os
import telebot
import sqlite3
import requests
from flask import Flask, request

# تنظیمات
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

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    bot.send_message(message.chat.id, "سلام! خوش آمدید.", reply_markup=markup)

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
    
    # ساخت فاکتور با متد POST استاندارد
    try:
        url = "https://plisio.net/api/v1/invoices/new"
        payload = {
            "api_key": PLISIO_API_KEY,
            "currency": "USDT_BSC",
            "amount": amounts.get(plan, "2.0"),
            "order_number": f"{call.message.chat.id}_{plan}",
            "order_name": f"VPN_{plan}",
            "callback_url": "https://t.me/Vpn_mirza_bot"
        }
        res = requests.post(url, data=payload, timeout=20).json()
        
        if res.get('status') == 'success':
            invoice_url = res['data']['invoice_url']
            markup = telebot.types.InlineKeyboardMarkup()
            markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=invoice_url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} با موفقیت ساخته شد:", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, "❌ خطای درگاه. لطفا دقایقی دیگر تلاش کنید.")
    except Exception:
        bot.send_message(call.message.chat.id, "❌ خطای اتصال به سرور.")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_update = request.get_json()
    if json_update:
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    # پورت رندر معمولاً از متغیر محیطی می‌آید
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
