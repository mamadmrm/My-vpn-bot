import os
import flask
import sqlite3
import threading
import telebot
from telebot import types
import requests

# تنظیمات سرور برای جلوگیری از خاموشی
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
threading.Thread(target=run).start()

API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312 
bot = telebot.TeleBot(API_TOKEN)

# تنظیم دیتابیس
conn = sqlite3.connect('database.db', check_same_thread=False)
c = conn.cursor()
c.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
c.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
conn.commit()
