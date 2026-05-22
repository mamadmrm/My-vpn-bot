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

# --- منطق درگاه اصلاح‌شده برای نمایش دکمه ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amount = "1.0" if plan == "1gb" else ("2.5" if plan == "3gb" else "4.0")
    
    # ساخت پارامترها به شکلی که پلسیو قبول کند (دقیق)
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amount,
        "order_number": str(call.message.chat.id) + "_" + plan,
        "order_name": "VPN_" + plan,
        "callback_url": "https://t.me/Vpn_mirza_bot"
    }
    
    try:
        # استفاده از متد get و دیکشنری params
        res = requests.get("https://plisio.net/api/v1/invoices/new", params=params).json()
        
        if res.get('status') == 'success':
            url = res['data']['invoice_url']
            # ساخت دکمه شیشه‌ای برای نمایش زیبا
            markup = telebot.types.InlineKeyboardMarkup()
            markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
            
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} با موفقیت ساخته شد:", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, f"❌ خطای درگاه: {res.get('data', {}).get('message', 'خطای نامشخص')}")
    except Exception as e:
        bot.send_message(call.message.chat.id, "❌ خطای اتصال به سرور.")

# سایر بخش‌ها (بدون تغییر)
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.stream.read().decode('utf-8'))])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
