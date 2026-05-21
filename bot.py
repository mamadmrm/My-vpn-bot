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
        "currency": "USDT_BSC",         # دقیقاً مثل نمونه روی تتر بایننس ست شد
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
        btn5 = types.InlineKeyboardButton(f"۵ گیگابایت ({PRICES['5gb']} دلار)", callback_data="buy_5gb")
        markup.add(btn1)
        markup.add(btn3, btn5)
        bot.send_message(message.chat.id, "📊 لطفاً حجم مورد نظر خود را انتخاب کنید:", reply_markup=markup)

    elif text == "📢 وضعیت سرورها و اطلاعیه":
        bot.send_message(message.chat.id, ANNOUNCEMENT_TEXT, parse_mode='Markdown')

    elif text == "☎️ پشتیبانی":
        bot.send_message(message.chat.id, f"جهت ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{SUPPORT_ID}")

    elif text == "⚙️ پنل مدیریت" and user_id == ADMIN_ID:
        markup = types.InlineKeyboardMarkup()
        btn1 = types.InlineKeyboardButton(f"افزودن ۱ گیگ (موجودی: {len(configs_pool['1gb'])})", callback_data="add_1gb")
        btn3 = types.InlineKeyboardButton(f"افزودن ۳ گیگ (موجودی: {len(configs_pool['3gb'])})", callback_data="add_3gb")
        btn5 = types.InlineKeyboardButton(f"افزودن ۵ گیگ (موجودی: {len(configs_pool['5gb'])})", callback_data="add_5gb")
        markup.add(btn1)
        markup.add(btn3, btn5)
        bot.send_message(message.chat.id, "⚙️ به پنل مدیریت خوش آمدید. مایلید به کدام بخش کانفیگ اضافه کنید؟", reply_markup=markup)

    elif user_id == ADMIN_ID and user_steps.get(user_id) in ['adding_1gb', 'adding_3gb', 'adding_5gb']:
        step = user_steps[user_id]
        plan = step.split('_')[1]
        lines = text.split('\n')
        added_count = 0
        for line in lines:
            if line.strip():
                configs_pool[plan].append(line.strip())
                added_count += 1
        user_steps[user_id] = None
        bot.send_message(message.chat.id, f"✅ تعداد {added_count} کانفیگ به بخش {plan} اضافه شد. موجودی کل: {len(configs_pool[plan])}")

@bot.callback_query_handler(func=lambda call: True)
def callback_inline(call):
    user_id = call.from_user.id
    
    if call.data.startswith("add_") and user_id == ADMIN_ID:
        plan = call.data.split("_")[1]
        markup = types.ForceReply(selective=False)
        bot.send_message(call.message.chat.id, f"📥 کانفیگ‌های جدید {plan} را بفرستید (هر کدام در یک خط):", reply_markup=markup)
        user_steps[user_id] = f'adding_{plan}'
        bot.answer_callback_query(call.id)

    elif call.data.startswith("buy_"):
        plan = call.data.split("_")[1]
        if len(configs_pool[plan]) == 0:
            bot.send_message(call.message.chat.id, f"❌ متاسفانه کانفیگ {plan} در حال حاضر موجود نیست.")
            bot.answer_callback_query(call.id)
            return
            
        bot.send_message(call.message.chat.id, f"⏳ در حال ساخت فاکتور پرداخت امن برای پلان {plan}...")
        price = PRICES[plan]
        invoice_result = create_plisio_invoice(price, plan)
        
        if invoice_result['ok']:
            invoice_data = invoice_result['data']
            invoice_url = invoice_data['invoice_url']
            invoice_id = invoice_data['txn_id']
            
            markup = types.InlineKeyboardMarkup()
            btn_pay = types.InlineKeyboardButton("💳 ورود به درگاه پرداخت آنلاین", url=invoice_url)
            btn_check = types.InlineKeyboardButton("🔄 بررسی وضعیت پرداخت ربات", callback_data=f"chk_{plan}_{invoice_id}")
            markup.add(btn_pay)
            markup.add(btn_check)
            
            bot.send_message(call.message.chat.id, f"💵 مبلغ فاکتور: {price} دلار\n\nلطفاً روی دکمه زیر کلیک کنید، پرداخت را انجام دهید و سپس دکمه بررسی را بزنید:", reply_markup=markup)
        else:
            bot.send_message(call.message.chat.id, f"❌ خطا در اتصال به درگاه:\n`{invoice_result['error']}`")
        bot.answer_callback_query(call.id)

    elif call.data.startswith("chk_"):
        parts = call.data.split("_")
        plan = parts[1]
        invoice_id = parts[2]
        
        status = check_plisio_status(invoice_id)
        if status in ['completed', 'mismatch']:
            if len(configs_pool[plan]) > 0:
                selected_config = configs_pool[plan].pop(0)
                bot.answer_callback_query(call.id, "🎉 پرداخت تایید شد!")
                bot.edit_message_text(f"🎉 پرداخت شما موفقیت‌آمیز بود!\n\n🔑 کانفیگ {plan} شما:\n\n`{selected_config}`", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode='Markdown')
            else:
                bot.send_message(call.message.chat.id, "⚠️ پرداخت تایید شد اما انبار خالی شده است! به پشتیبانی پیام دهید.")
        else:
            bot.answer_callback_query(call.id, "❌ پرداخت هنوز تایید نشده است. کمی صبر کنید و دوباره بزنید.", show_alert=True)

bot.infinity_polling()
