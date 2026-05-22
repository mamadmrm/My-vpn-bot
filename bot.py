import os
import telebot
import sqlite3
import requests
from flask import Flask, request

# --- تنظیمات ---
TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
WEBHOOK_URL = "https://my-vpn-bot-wt0a.onrender.com/"
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# --- دیتابیس ---
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# --- منوها ---
@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام! به ربات Vpn Mirza خوش آمدید.", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۱ گیگ - ۱$", callback_data="buy_1gb"))
    markup.add(telebot.types.InlineKeyboardButton("۳ گیگ - ۲.۵$", callback_data="buy_3gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

# --- درگاه پرداخت ---
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_payment(call):
    plan = call.data.split("_")[1]
    amount = "1.0" if plan == "1gb" else ("2.5" if plan == "3gb" else "4.0")
    try:
        res = requests.
