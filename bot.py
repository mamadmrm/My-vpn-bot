import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
WEBHOOK_URL = "https://my-vpn-bot-wt0a.onrender.com/"
# کلید API خودت را دقیق اینجا چک کن (نباید فاصله داشته باشد)
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# --- سیستم خرید (کاملا اصلاح شده) ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    # مبالغ دقیق
    amounts = {"1gb": "1.0", "3gb": "2.5", "5gb": "4.0"}
    amount = amounts.get(plan, "1.0")
    
    try:
        # درخواست مستقیم به پلسیو با ارز ثابت USDT_BSC
        response = requests.post("https://plisio.net/api/v1/invoices/new", data={
            "api_key": PLISIO_API_KEY,
            "currency": "USDT_BSC",
            "amount": amount,
            "order_number": f"{call.message.chat.id}_{plan}",
            "order_name": f"VPN_{plan}",
            "callback_url": WEBHOOK_URL + "callback"
        }, timeout=10).json()
        
        if response.get('status') == 'success':
            url = response['data']['invoice_url']
            bot.send_message(call.message.chat.id, f"✅ فاکتور ساخته شد.\nمبلغ: {amount} $\n\n[💳 پرداخت آنلاین]({url})", parse_mode="Markdown")
        else:
            # نمایش دقیق خطا برای عیب‌یابی
            err_msg = response.get('data', {}).get('message', 'خطای ناشناس')
            bot.send_message(call.message.chat.id, f"❌ خطای درگاه: {err_msg}")
    except Exception as e:
        bot.send_message(call.message.chat.id, "❌ خطای اتصال به سرور پلسیو.")

# --- وب‌هوک و شروع ---
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.stream.read().decode('utf-8'))])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
