import os
import telebot
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# --- منطق ربات ---
@bot.message_handler(commands=['start'])
def start(message):
    bot.send_message(message.chat.id, "✅ ربات با موفقیت فعال شد!")

# --- بخش حیاتی: اتصال به رندر ---
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    json_str = request.stream.read().decode('utf-8')
    update = telebot.types.Update.de_json(json_str)
    bot.process_new_updates([update])
    return "OK", 200

@app.route('/')
def home():
    return "Bot is running perfectly!", 200

if __name__ == "__main__":
    # حذف وب‌هوک قدیمی برای رفع ارور Conflict
    bot.remove_webhook()
    # تنظیم وب‌هوک جدید
    bot.set_webhook(url="https://my-vpn-bot-wt0a.onrender.com/" + TOKEN)
    # اجرای وب سرور با پورت رندر
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
