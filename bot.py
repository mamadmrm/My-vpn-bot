import os
import flask
from threading import Thread
import telebot
from telebot import types
import requests

# ترفند پورت برای سایت رندر
app = flask.Flask('')
@app.route('/')
def home(): return "Bot is running!"
def run(): app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 80)))
Thread(target=run).start()

# ----------------------------------------------------
# اطلاعات اختصاصی شما
API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312  
SUPPORT_ID = '@number76'

# قیمت حجم‌های مختلف به دلار 💵
PRICES = {
    "1gb": 1.0,
    "3gb": 2.5,
    "5gb": 4.0
}

# متن اطلاعیه وضعیت سرورها
ANNOUNCEMENT_TEXT = "📢 **اطلاعیه مهم:**\nکاربران گرامی، به دلیل آپدیت و بهینه‌سازی سرورها جهت افزایش سرعت، ممکن است در برخی ساعات افت سرعت یا قطعی موقت داشته باشیم. از شکیبایی شما سپاسگزاریم. ❤️"

# توکن اختصاصی Plisio شما
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy' 

bot = telebot.TeleBot(API_TOKEN)

# انبارهای مجزا برای حجم‌های مختلف 📦
configs_pool = {
    "1gb": [],
    "3gb": [],
    "5gb": []
}
user_steps = {}

def create_plisio_invoice(amount, plan_name):
    url = "https://plisio.net/api/v1/invoices/new"
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "TON",
        "order_number": os.urandom(4).hex(),
        "order_name": f"خرید کانفیگ {plan_name}",
        "amount": str(amount),
        "source_currency": "USD",
        "callback_url": "https://t.me/Vpn_mirza_bot"
    }
    try:
        response = requests.get(url, params=params, timeout=12)
        res_json = response.json()
        if response.status_code == 200 and res_json.get('status') == 'success':
            return {"ok": True, "data": res_json['data']}
        else:
            error_msg = res_json.get('data', {}).get('message', 'خطای ناشناخته')
            return {"ok": False, "error": f"{error_msg} (Status: {response.status_code})"}
    except Exception as e:
        return {"ok": False, "error": str(e
