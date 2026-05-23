import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
# آدرس دامین جدید خود را در Railway اینجا وارد کنید (بدون / در آخر)
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# دستور start
@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام! به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

# منوی خرید
@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۲ گیگ - ۲$", callback_data="buy_2gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_10gb"))
    markup.add(telebot.types.InlineKeyboardButton("۱۰ گیگ - ۹$", callback_data="buy_10gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

# درگاه پرداخت
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amounts = {"2gb": "2.0", "5gb": "4.0", "10gb": "9.0"}
    amount = amounts.get(plan, "2.0")
    
    try:
        params = {
            "api_key": PLISIO_API_KEY,
            "currency": "USDT_BSC",
            "amount": amount,
            "order_number": str(call.message.chat.id) + "_" + plan,
            "order_name": "VPN_" + plan
        }
        res = requests.get("https://plisio.net/api/v1/invoices/new", params=params, timeout=15).json()
        
        if res.get('status') == 'success':
            url = res['data']['invoice_url']
            markup = telebot.types.InlineKeyboardMarkup()
            markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=url))
            bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} ساخته شد:", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, "❌ خطای درگاه. دوباره تلاش کنید.")
    except Exception:
        bot.send_message(call.message.chat.id, "❌ خطای سرور.")

# سرویس‌های من
@bot.message_handler(func=lambda m: m.text == '📁 سرویس‌های من')
def my_services(message):
    configs = db.execute("SELECT plan, link FROM user_configs WHERE user_id=?", (message.chat.id,)).fetchall()
    if not configs:
        bot.send_message(message.chat.id, "⚠️ سرویس فعالی یافت نشد.")
    else:
        text = "📁 کانفیگ‌های شما:\n"
        for p, l in configs: text += f"• `{l}`\n"
        bot.send_message(message.chat.id, text, parse_mode="Markdown")

# پنل مدیریت
@bot.message_handler(func=lambda m: m.text == '⚙️ پنل مدیریت' and m.chat.id == ADMIN_ID)
def admin_menu(message):
    msg = bot.send_message(message.chat.id, "فرمت: [2gb/5gb/10gb] [لینک]")
    bot.register_next_step_handler(msg, save_cfg)

def save_cfg(message):
    try:
        plan, link = message.text.split(" ", 1)
        db.execute("INSERT INTO config_pool (plan, link) VALUES (?, ?)", (plan, link))
        db.commit()
        bot.send_message(message.chat.id, "✅ ذخیره شد.")
    except:
        bot.send_message(message.chat.id, "❌ فرمت اشتباه بود.")

# وب‌هوک
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    if request.headers.get('content-type') == 'application/json':
        json_update = request.get_json()
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
        return "OK", 200
    return "Forbidden", 403

if __name__ == "__main__":
    bot.remove_webhook()
    # اتصال وب‌هوک به Railway
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN
