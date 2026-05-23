import os
import telebot
import requests
from flask import Flask, request

# تنظیمات
TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# لیست پلن‌ها
PLANS = {"2gb": "2.0", "5gb": "4.0", "10gb": "9.0"}

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add('🛒 خرید اشتراک', '🎁 دریافت تست')
    bot.send_message(message.chat.id, "سلام! ربات فروش VPN آماده است.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    for p in PLANS:
        markup.add(telebot.types.InlineKeyboardButton(f"{p} - {PLANS[p]}$", callback_data=f"buy_{p}"))
    bot.send_message(message.chat.id, "پلن انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    payload = {
        "api_key": PLISIO_API_KEY, "currency": "USDT_BSC", "amount": PLANS[plan],
        "order_number": f"{call.message.chat.id}_{plan}", "order_name": f"VPN_{plan}",
        "callback_url": f"{WEBHOOK_URL}/callback"
    }
    res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload)
    if res.status_code == 200:
        bot.send_message(call.message.chat.id, f"💳 پرداخت: {res.json()['data']['invoice_url']}")

@app.route('/callback', methods=['POST'])
def plisio_callback():
    # اینجا پلسیو خبر می‌دهد که پرداخت اوکی شده
    # چون پنل نداری، اینجا مستقیم متن کانفیگ را برای کاربر می‌فرستیم
    user_id = request.form.get("order_number", "").split("_")[0]
    bot.send_message(user_id, "✅ پرداخت شما تایید شد. این کانفیگ اختصاصی شماست:\n`vmess://YOUR_CONFIG_HERE`", parse_mode='Markdown')
    return "OK", 200

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.get_json())])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    app.run(host="0.0.0.0", port=8080)
