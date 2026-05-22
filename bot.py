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

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    bot.send_message(message.chat.id, "سلام! ربات Vpn Mirza در خدمت شماست.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۲ گیگ - ۲$", callback_data="buy_2gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_10gb")) #اصلاح پلن ۵
    markup.add(telebot.types.InlineKeyboardButton("۱۰ گیگ - ۹$", callback_data="buy_10gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amounts = {"2gb": "2.0", "5gb": "4.0", "10gb": "9.0"}
    
    # ساخت هدرهای دقیق که هر وب‌سایتی را راضی می‌کند
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }
    
    payload = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amounts.get(plan, "2.0"),
        "order_number": f"{call.message.chat.id}_{plan}",
        "order_name": f"VPN_{plan}",
        "callback_url": "https://google.com" # حتی یک یو‌ار‌ال ساده هم کافیست
    }
    
    try:
        # متد POST با هدر کامل
        res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload, headers=headers, timeout=20)
        
        if res.status_code == 200:
            res_data = res.json()
            if res_data.get('status') == 'success':
                url = res_data['data']['invoice_url']
                markup = telebot.types.InlineKeyboardMarkup()
                markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
                bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} آماده است:", reply_markup=markup)
            else:
                bot.send_message(call.message.chat.id, f"❌ خطای پلسیو: {res_data.get('data', {}).get('message', 'خطای ناشناس')}")
        else:
            bot.send_message(call.message.chat.id, f"❌ سرور پلسیو پاسخ نداد (کد: {res.status_code})")
    except Exception as e:
        bot.send_message(call.message.chat.id, f"❌ خطای اتصال به درگاه: {str(e)[:40]}")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    if request.headers.get('content-type') == 'application/json':
        json_update = request.get_json()
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
        return "OK", 200
    return "Forbidden", 403

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
