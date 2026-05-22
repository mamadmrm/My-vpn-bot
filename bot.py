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

# --- درگاه پرداخت اصلاح شده ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amounts = {"2gb": "2.0", "5gb": "4.0", "10gb": "9.0"}
    amount = amounts.get(plan, "2.0")
    
    # تعریف هدر برای جلوگیری از بلاک شدن توسط پلسیو
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    payload = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amount,
        "order_number": f"{call.message.chat.id}_{plan}",
        "order_name": f"VPN_{plan}",
        "callback_url": "https://webhook.site/your-unique-id" # اختیاری
    }
    
    try:
        # استفاده از POST به جای GET
        res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload, headers=headers, timeout=20)
        res_data = res.json()
        
        if res_data.get('status') == 'success':
            url = res_data['data']['invoice_url']
            markup = telebot.types.InlineKeyboardMarkup()
            markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} با موفقیت صادر شد.", reply_markup=markup)
        else:
            # اینجا خطای واقعی را نشان می‌دهد
            error_msg = res_data.get('data', {}).get('message', 'خطای نامشخص')
            bot.send_message(call.message.chat.id, f"❌ خطای درگاه: {error_msg}")
    except Exception as e:
        bot.send_message(call.message.chat.id, f"❌ خطای شبکه: {str(e)[:50]}")

# بقیه بخش‌ها تغییری نکرده
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.stream.read().decode('utf-8'))])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
