import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
app = Flask(__name__)
bot = telebot.TeleBot(TOKEN)

# دیتابیس ساده (بدون پیچیدگی)
try:
    db = sqlite3.connect('database.db', check_same_thread=False)
    db.execute('CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, has_test INTEGER)')
    db.commit()
except:
    pass

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    try:
        json_update = request.get_json()
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
    except:
        pass
    return "OK", 200

@bot.message_handler(commands=['start'])
def start(message):
    bot.send_message(message.chat.id, "ربات روشن است! برای تست دکمه خرید را بزن.")

# این بخش برای جلوگیری از کرش کردن در صورت نبود متغیر
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
