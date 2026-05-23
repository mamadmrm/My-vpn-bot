import os
import telebot
import sqlite3
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
# آدرس دامین خود را دقیقاً اینجا بنویسید (بدون / در آخر)
WEBHOOK_HOST = 'my-vpn-bot-production.up.railway.app' 
WEBHOOK_URL = f"https://{WEBHOOK_HOST}/{TOKEN}"

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    if request.headers.get('content-type') == 'application/json':
        json_update = request.get_json()
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
        return "OK", 200
    else:
        return "Forbidden", 403

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '🎁 دریافت تست رایگان')
    markup.row('📁 سرویس‌های من')
    bot.send_message(message.chat.id, "ربات فعال است! لطفاً یکی از گزینه‌ها را انتخاب کنید.", reply_markup=markup)

# برای اینکه متوجه شویم دکمه‌ها کار می‌کنند
@bot.message_handler(func=lambda m: True)
def echo_all(message):
    bot.send_message(message.chat.id, f"شما گفتید: {message.text}")

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
