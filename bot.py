import telebot
import requests
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
MARZBAN_URL = "http://YOUR_MARZBAN_IP:8000" # آی‌پی سرور خودت
MARZBAN_USER = "admin"
MARZBAN_PASS = "admin_password"

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# گرفتن توکنِ پنل
def get_token():
    res = requests.post(f"{MARZBAN_URL}/api/admin/token", data={"username": MARZBAN_USER, "password": MARZBAN_PASS})
    return res.json()["access_token"]

# ساخت کاربر در پنل
def create_user(username, data_limit):
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "username": username,
        "data_limit": data_limit * 1024 * 1024 * 1024, # تبدیل گیگ به بایت
        "proxies": {"vmess": {}},
        "expire": None
    }
    res = requests.post(f"{MARZBAN_URL}/api/user", json=payload, headers=headers)
    return res.json().get("subscription_url")

@bot.message_handler(commands=['start'])
def start(message):
    bot.send_message(message.chat.id, "برای دریافت کانفیگ تست، دکمه زیر را بزنید.", 
                     reply_markup=telebot.types.InlineKeyboardMarkup().add(
                         telebot.types.InlineKeyboardButton("دریافت تست", callback_data="get_test")))

@bot.callback_query_handler(func=lambda call: call.data == "get_test")
def handle_test(call):
    # ساخت یک کاربر با ۱ گیگ تست در پنل مارزبان
    link = create_user(f"user_{call.from_user.id}", 1)
    bot.send_message(call.from_user.id, f"✅ کانفیگ شما:\n`{link}`", parse_mode='Markdown')

# ... (بخش Flask و Webhook مثل قبل)
