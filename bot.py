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
PRICE_USD = 1.0  # قیمت کانفیگ به دلار

# 🔴 توکن اختصاصی Plisio شما که با موفقیت جاگذاری شد:
PLISIO_API_KEY = 'QU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy' 

bot = telebot.TeleBot(API_TOKEN)
configs_pool = []
user_steps = {}

def create_plisio_invoice(amount):
    url = "https://plisio.net/api/v1/invoices/new"
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT",        # ارز پایه فاکتور
        "order_number": os.urandom(4).hex(),
        "order_name": "خرید کانفیگ اختصاصی",
        "amount": str(amount),
        "source_currency": "USD",
        "callback_url": "https://t.me/Vpn_mirza_bot"  # بازگشت به ربات شما
    }
    try:
        response = requests.get(url, params=params, timeout=12)
        res_json = response.json()
        if response.status_code == 200 and res_json.get('status') == 'success':
            return {"ok": True, "data": res_json['data']}
        else:
            error_msg = res_json.get('data', {}).get('message', 'خطای
