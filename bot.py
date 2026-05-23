import os
import telebot
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک')
    bot.send_message(message.chat.id, "سلام! به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۲ گیگ - ۲$", callback_data="buy_2gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    bot.send_message(message.chat.id, "لطفاً پلن خود را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amounts = {"2gb": "2.0", "5gb": "4.0"}
    amount = amounts.get(plan, "2.0")
    
    payload = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amount,
        "order_number": f"{call.message.chat.id}_{plan}",
        "order_name": f"VPN_{plan}"
    }
    
    try:
        res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload, timeout=15)
        data = res.json()
        if data.get('status') == 'success':
            url = data['data']['invoice_url']
            markup = telebot.types.InlineKeyboardMarkup()
            markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} ساخته شد. پرداخت کنید:", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, "❌ خطای درگاه پرداخت.")
    except Exception as e:
        bot.send_message(call.message.chat.id, "❌ خطای فنی در اتصال.")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_update = request.get_json()
    if json_update:
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
