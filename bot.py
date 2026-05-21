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
        "currency": "BNB",             # تغییر به BNB برای باز شدن همزمان BNB و TON در مبالغ زیر ۳ دلار
        "order_number": os.urandom(4).hex(),
        "order_name": f"خرید کانفیگ {plan_name}",
        "amount": str(amount),
        "source_currency": "USD",      # قیمت‌گذاری بر اساس دلار واقعی شما
        "callback_url": "https://t.me/Vpn_mirza_bot"
    }
    try:
        response = requests.get(url, params=params, timeout=12)
        res_json = response.json()
        if response.status_code == 200 and res_json.get('status') == 'success':
            return {"ok": True, "data": res_json['data']}
        else:
            error_msg = res_json.get('data', {}).get('message', 'خطای ناشناخته')
            return {"ok": False, "error": error_msg}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def check_plisio_status(invoice_id):
    url = f"https://plisio.net/api/v1/invoices/{invoice_id}"
    params = {"api_key": PLISIO_API_KEY}
    try:
        response = requests.get(url, params=params, timeout=10)
        res_json = response.json()
        if res_json.get('status') == 'success':
            return res_json['data'].get('status')
    except:
        return 'error'

@bot.message_handler(commands=['start'])
def send_welcome(message):
    user_id = message.from_user.id
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    
    btn_buy = types.KeyboardButton("🔑 خرید کانفیگ")
    btn_status = types.KeyboardButton("📢 وضعیت سرورها و اطلاعیه")
    btn_support = types.KeyboardButton("☎️ پشتیبانی")
    
    markup.add(btn_buy)
    markup.add(btn_status, btn_support)
    
    if user_id == ADMIN_ID:
        btn_admin = types.KeyboardButton("⚙️ پنل مدیریت")
        markup.add(btn_admin)
        
    bot.send_message(message.chat.id, "به ربات فروش اتوماتیک کانفیگ خوش آمدید! لطفاً یک گزینه را انتخاب کنید:", reply_markup=markup)

@bot.message_handler(func=lambda message: True)
def handle_messages(message):
    user_id = message.from_user.id
    text = message.text

    if text == "🔑 خرید کانفیگ":
        markup = types.InlineKeyboardMarkup()
        btn1 = types.InlineKeyboardButton(f"۱ گیگابایت ({PRICES['1gb']} دلار)", callback_data="buy_1gb")
        btn3 = types.InlineKeyboardButton(f"۳ گیگابایت ({PRICES['3gb']} دلار)", callback_data="buy_3gb")
