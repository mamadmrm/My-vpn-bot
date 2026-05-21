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
PRICE_USD = 3.0  # قیمت کانفیگ به ۳ دلار افزایش یافت تا Plisio ایراد نگیرد

# توکن اختصاصی Plisio شما با حروف کوچک و بزرگ دقیق
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy' 

bot = telebot.TeleBot(API_TOKEN)
configs_pool = []
user_steps = {}

def create_plisio_invoice(amount):
    url = "https://plisio.net/api/v1/invoices/new"
    params = {
        "api_key": PLISIO_API_KEY,
        "currency": "USDT",
        "order_number": os.urandom(4).hex(),
        "order_name": "خرید کانفیگ اختصاصی",
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
    btn_support = types.KeyboardButton("☎️ پشتیبانی")
    markup.add(btn_buy, btn_support)
    
    if user_id == ADMIN_ID:
        btn_admin = types.KeyboardButton("⚙️ پنل مدیریت (افزودن کانفیگ)")
        markup.add(btn_admin)
        
    bot.send_message(message.chat.id, "به ربات فروش اتوماتیک کانفیگ خوش آمدید!", reply_markup=markup)

@bot.message_handler(func=lambda message: True)
def handle_messages(message):
    user_id = message.from_user.id
    text = message.text

    if text == "🔑 خرید کانفیگ":
        if len(configs_pool) == 0:
            bot.send_message(message.chat.id, "❌ متاسفانه در حال حاضر کانفیگ موجودی نداریم. لطفا به پشتیبانی پیام دهید.")
            return
            
        bot.send_message(message.chat.id, "⏳ در حال ساخت فاکتور پرداخت امن Plisio...")
        
        invoice_result = create_plisio_invoice(PRICE_USD)
        if invoice_result['ok']:
            invoice_data = invoice_result['data']
