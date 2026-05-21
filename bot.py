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

# توکن اختصاصی Plisio شما
PLISIO_API_KEY = 'QU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy' 

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
        
    bot.send_message(message.chat.id, "به ربات فروش اتفاوتیک کانفیگ خوش آمدید!", reply_markup=markup)

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
            invoice_url = invoice_data['invoice_url']
            invoice_id = invoice_data['txn_id']
            
            markup = types.InlineKeyboardMarkup()
            btn_pay = types.InlineKeyboardButton("💳 ورود به درگاه پرداخت آنلاین", url=invoice_url)
            btn_check = types.InlineKeyboardButton("🔄 بررسی وضعیت پرداخت ربات", callback_data=f"check_{invoice_id}")
            markup.add(btn_pay)
            markup.add(btn_check)
            
            bot.send_message(message.chat.id, f"💵 مبلغ فاکتور: {PRICE_USD} دلار\n\nلطفاً روی دکمه زیر کلیک کنید، رمز ارز دلخواه را انتخاب و واریز را انجام دهید. سپس دکمه بررسی را بزنید:", reply_markup=markup)
        else:
            bot.send_message(message.chat.id, f"❌ خطای سیستم درگاه Plisio:\n`{invoice_result['error']}`\n\nلطفاً تنظیمات توکن را بررسی کنید.")

    elif text == "☎️ پشتیبانی":
        bot.send_message(message.chat.id, f"جهت ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{SUPPORT_ID}")

    elif text == "⚙️ پنل مدیریت (افزودن کانفیگ)" and user_id == ADMIN_ID:
        markup = types.ForceReply(selective=False)
        bot.send_message(message.chat.id, f"📦 موجودی انبار: {len(configs_pool)} کانفیگ\n\nکانفیگ‌های جدید را بفرستید (هر کدام در یک خط):", reply_markup=markup)
        user_steps[user_id] = 'adding_configs'

    elif user_steps.get(user_id) == 'adding_configs' and user_id == ADMIN_ID:
        lines = text.split('\n')
        added_count = 0
        for line in lines:
            if line.strip():
                configs_pool.append(line.strip())
                added_count += 1
        user_steps[user_id] = None
        bot.send_message(message.chat.id, f"✅ تعداد {added_count} کانفیگ اضافه شد. موجودی کل: {len(configs_pool)}")

@bot.callback_query_handler(func=lambda call: True)
def callback_inline(call):
    if call.data.startswith("check_"):
        invoice_id = call.data.split("_")[1]
        status = check_plisio_status(invoice_id)
        
        if status in ['completed', 'mismatch']:
            if len(configs_pool) > 0:
                selected_config = configs_pool.pop(0)
                bot.answer_callback_query(call.id, "🎉 پرداخت با موفقیت تایید شد!")
                bot.edit_message_text(f"🎉 پرداخت شما با موفقیت تایید شد!\n\nکانفیگ شما:\n\n`{selected_config}`\n\nبرای کپی شدن روی آن ضربه بزنید.", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode='Markdown')
            else:
                bot.send_message(call.message.chat.id, "⚠️ پرداخت تایید شد اما انبار خالی است! سریعاً به پشتیبانی پیام دهید.")
        else:
            bot.answer_callback_query(call.id, "❌ شبکه هنوز واریزی شما را تایید نکرده است. کمی صبر کنید و مجدد بزنید.", show_alert=True)

bot.infinity_polling()
