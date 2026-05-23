import os
import telebot
import sqlite3
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
# از Environment Variable استفاده کن اگر دامین فرق دارد
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "https://my-vpn-bot-production.up.railway.app")
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# مسیر دیتابیس در روت اصلی سرور (برای جلوگیری از خطای دسترسی)
DB_PATH = os.path.join(os.getcwd(), 'database.db')
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# --- در صورت کرش کردن، این لاگِ خطا را برایم بفرست ---

@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    try:
        json_update = request.get_json()
        bot.process_new_updates([telebot.types.Update.de_json(json_update)])
        return "OK", 200
    except Exception as e:
        print(f"Error: {e}")
        return "OK", 200 # ربات را برای یک خطای کوچک کرش نکن

@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID: markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام! ربات فعال است.", reply_markup=markup)

# ... (بقیه توابع مثل قبل)

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=f"{WEBHOOK_URL}/{TOKEN}")
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
