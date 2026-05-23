import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
WEBHOOK_URL = "https://my-vpn-bot-production.up.railway.app"
ADMIN_ID = 489450312
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام! ربات Vpn Mirza آماده است.", reply_markup=markup)

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
    amount = amounts.get(plan, "2.0")
    
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT_BSC",
        "amount": amount,
        "order_number": f"{call.message.chat.id}_{plan}",
        "order_name": f"VPN_{plan}"
    }
    
    res = requests.get("https://plisio.net/api/v1/invoices/new", params=params).json()
    if res.get('status') == 'success':
        markup = telebot.types.InlineKeyboardMarkup()
        markup.add(telebot.types.InlineKeyboardButton("💳 پرداخت آنلاین", url=res['data']['invoice_url']))
        bot.send_message(call.message.chat.id, f"✅ فاکتور {plan} ساخته شد:", reply_markup=markup)
    else:
        bot.send_message(call.message.chat.id, "❌ خطای درگاه.")

@bot.message_handler(func=lambda m: m.text == '📁 سرویس‌های من')
def my_services(message):
    configs = db.execute("SELECT plan, link FROM user_configs WHERE user_id=?", (message.chat.id,)).fetchall()
    if not configs:
        bot.send_message(message.chat.id, "⚠️ هیچ سرویس فعالی ندارید.")
    else:
        text = "📁 کانفیگ‌های شما:\n" + "\n".join([f"• `{l}`" for p, l in configs])
        bot.send_message(message.chat.id, text, parse_mode="Markdown")

@bot.message_handler(func=lambda m: m.text == '⚙️ پنل مدیریت' and m.chat.id == ADMIN_ID)
def admin_menu(message):
    msg = bot.send_message(message.chat.id, "فرمت: [2gb/5gb/10gb] [لینک]")
    bot.register_next_step_handler(msg, save_cfg)

def save_cfg(message):
    plan, link = message.text.split(" ", 1)
    db.execute("INSERT INTO config_pool (plan, link) VALUES (?, ?)", (plan, link))
    db.commit()
    bot.send_message(message.chat.id, "✅ ذخیره شد.")

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_update = request.get_json()
    bot.process_new_updates([telebot.types.Update.de_json(json_update)])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
