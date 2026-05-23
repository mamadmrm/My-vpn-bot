import os
import telebot
import sqlite3
import requests
from flask import Flask, request

# دریافت توکن و کلیدها از Environment Variables برای امنیت بیشتر (در Railway تنظیم کن)
TOKEN = os.environ.get('TOKEN', '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI')
PLISIO_API_KEY = os.environ.get('PLISIO_API_KEY', 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy')
# آدرس دامنه‌ای که Railway بهت داده رو اینجا بذار (بدون / آخر)
WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'https://my-vpn-bot-production.up.railway.app')

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
    bot.send_message(message.chat.id, "سلام! ربات Vpn Mirza در خدمت شماست.", reply_markup=markup)

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
    
    headers = {'User-Agent': 'Mozilla/5.0'}
    payload = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amounts.get(plan, "2.0"),
        "order_number": f"{call.message.chat.id}_{plan}",
        "order_name": f"VPN_{plan}",
        "callback_url": "https://google.com"
    }
    
    try:
        # استفاده از session برای پایداری بیشتر
        session = requests.Session()
        res = session.post("https://plisio.net/api/v1/invoices/new", data=payload, headers=headers, timeout=20)
        
        if res.status_code == 200:
            res_data = res.json()
            if res_data.get('status') == 'success':
                url = res_data['data']['invoice_url']
                markup = telebot.types.InlineKeyboardMarkup()
                markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
                bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} آماده است:", reply_markup=markup)
            else:
                bot.send_message(call.message.chat.id, "❌ خطای درگاه پرداخت.")
        else:
            bot.send_message(call.message.chat.id, "❌ سرور درگاه پاسخ نداد.")
    except Exception as e:
        bot.send_message(call.message.chat.id, f"❌ خطا: {str(e)[:30]}")

# مسیر وب‌هوک برای اتصال به تلگرام
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_update = request.get_json()
    bot.process_new_updates([telebot.types.Update.de_json(json_update)])
    return "OK", 200

@app.route('/')
def home():
    return "Bot is running!"

if __name__ == "__main__":
    # تنظیم وب‌هوک هنگام اجرای کد
    webhook_link = f"{WEBHOOK_URL}/{TOKEN}"
    bot.remove_webhook()
    bot.set_webhook(url=webhook_link)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
