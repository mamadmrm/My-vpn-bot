import os
import telebot
import sqlite3
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
WEBHOOK_URL = "https://my-vpn-bot-wt0a.onrender.com/"

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس ساده
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.commit()

# منوی کاربری
@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    markup.row('📢 اطلاعیه', '👤 پشتیبانی')
    if message.chat.id == ADMIN_ID:
        markup.add('➕ افزودن کانفیگ')
    bot.send_message(message.chat.id, "خوش آمدید. از منوی زیر انتخاب کنید:", reply_markup=markup)

# بخش خرید
@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def buy(message):
    bot.send_message(message.chat.id, "این بخش در حال اتصال به درگاه است.")

# بخش ادمین (افزودن کانفیگ)
@bot.message_handler(func=lambda m: m.text == '➕ افزودن کانفیگ' and m.chat.id == ADMIN_ID)
def add_cfg(message):
    msg = bot.send_message(message.chat.id, "پلن و لینک را با فرمت زیر بفرست:\n1gb vless://...")
    bot.register_next_step_handler(msg, save_cfg)

def save_cfg(message):
    try:
        plan, link = message.text.split(" ", 1)
        db.execute("INSERT INTO config_pool VALUES (?, ?)", (plan, link))
        db.commit()
        bot.send_message(message.chat.id, "✅ ذخیره شد.")
    except:
        bot.send_message(message.chat.id, "❌ فرمت اشتباه بود.")

# اتصال به رندر
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_str = request.stream.read().decode('utf-8')
    update = telebot.types.Update.de_json(json_str)
    bot.process_new_updates([update])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
