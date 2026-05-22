import telebot
import os
from flask import Flask, request

# تنظیمات اصلی
TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# حذف هرگونه Polling قدیمی که باعث ارور 409 می‌شود
bot.remove_webhook()

@bot.message_handler(commands=['start'])
def start(message):
    bot.send_message(message.chat.id, "ربات متصل است. سیستم در وضعیت پایداری قرار دارد.")

# این بخش برای رندر حیاتی است
@app.route('/' + TOKEN, methods=['POST'])
def getMessage():
    json_str = request.stream.read().decode('utf-8')
    update = telebot.types.Update.de_json(json_str)
    bot.process_new_updates([update])
    return "!", 200

if __name__ == "__main__":
    # تنظیم Webhook (این کار را فقط یکبار انجام می‌دهد)
    bot.set_webhook(url="https://نام-ربات-شما.onrender.com/" + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get('PORT', 5000)))
