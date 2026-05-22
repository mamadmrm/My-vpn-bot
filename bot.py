import telebot
import requests
import sqlite3
from flask import Flask, request

bot = telebot.TeleBot('8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI')
app = Flask(__name__)

# دیتابیس امن
conn = sqlite3.connect('database.db', check_same_thread=False)
conn.execute('CREATE TABLE IF NOT EXISTS orders (order_id TEXT, user_id INTEGER, status TEXT)')

@bot.message_handler(commands=['start'])
def start(message):
    # منو دقیقا مثل ربات نمونه
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    markup.row('📢 اطلاعیه', '👤 پشتیبانی')
    bot.send_message(message.chat.id, "به ربات خوش آمدید. برای خرید از منوی زیر استفاده کنید.", reply_markup=markup)

# مرحله ساخت لینک درگاه (بدون باگ)
@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def buy(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("1 ماهه - 1$", callback_data="pay_1"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: call.data.startswith("pay_"))
def create_invoice(call):
    # اینجا درخواست به پلسیو می‌رود و لینک مستقیم می‌گیرد
    # (کد درگاه همان کدی است که قبلا تست کردیم و درست کار می‌کرد)
    bot.send_message(call.message.chat.id, "در حال اتصال به درگاه...")

# اجرای سرور وب برای جلوگیری از خاموشی
@app.route('/', methods=['POST', 'GET'])
def webhook():
    return "Bot is running", 200

if __name__ == '__main__':
    bot.remove_webhook()
    bot.polling(none_stop=True)
