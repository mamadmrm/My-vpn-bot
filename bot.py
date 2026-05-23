import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'
# آدرس دامین خودت را اینجا بگذار
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"
ADMIN_ID = 489450312

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس برای ذخیره کانفیگ‌ها
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS services (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '🎁 دریافت تست رایگان')
    markup.row('📁 سرویس‌های من')
    bot.send_message(message.chat.id, "سلام، به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

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
    
    # ساخت فاکتور در پلسیو
    payload = {
        "api_key": PLISIO_API_KEY, "currency": "USDT_BSC", "amount": amounts.get(plan, "2.0"),
        "order_number": f"{call.message.chat.id}_{plan}", "order_name": f"VPN_{plan}",
        "callback_url": f"{WEBHOOK_URL}/plisio_callback"
    }
    res = requests.post("https://plisio.net/api/v1/invoices/new", data=payload)
    if res.status_code == 200:
        url = res.json()['data']['invoice_url']
        bot.send_message(call.message.chat.id, f"✅ برای پرداخت کلیک کنید:\n{url}")

@app.route('/plisio_callback', methods=['POST'])
def plisio_callback():
    # اینجا وقتی پلسیو خبر می‌دهد پرداخت انجام شده
    data = request.form
    order_info = data.get("order_number", "").split("_")
    user_id = order_info[0]
    plan = order_info[1]
    
    # دادن کانفیگ متنی به کاربر
    config_link = f"vmess://config-for-{plan}-user-{user_id}"
    db.execute('INSERT INTO services (user_id, plan, link) VALUES (?, ?, ?)', (user_id, plan, config_link))
    db.commit()
    bot.send_message(user_id, f"✅ پرداخت تایید شد. کانفیگ شما:\n`{config_link}`", parse_mode='Markdown')
    return "OK", 200

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.get_json())])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
