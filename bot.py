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
# اطلاعات اختصاصی و دقیق شما
API_TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312  
SUPPORT_ID = '@number76'
CRYPTO_PAY_TOKEN = '585429:AA0wr5EANpW7VvqRJ9NMxEpTc6q1WjSjAPJ'
PRICE_USD = 1.0 

bot = telebot.TeleBot(API_TOKEN)
configs_pool = []
user_steps = {}

def create_invoice(amount):
    url = "https://pay.cryptobase.space/api/createInvoice"
    headers = {"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}
    payload = {
        "asset": "USDT",
        "amount": str(amount),
        "description": "خرید کانفیگ اختصاصی",
        "paid_btn_name": "callback",
        # 🔴 آیدی ربات شما دقیقاً ست شد تا درگاه خطا ندهد
        "paid_btn_url": "https://t.me/Vpn_mirza_bot" 
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        res_json = response.json()
        if response.status_code == 200 and res_json.get('ok'):
            return {"ok": True, "data": res_json}
        else:
            return {"ok": False, "error": res_json.get('description', f"Status Code: {response.status_code}")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def check_invoice(invoice_id):
    url = "https://pay.cryptobase.space/api/getInvoices"
    headers = {"Crypto-Pay-API-Token": CRYPTO_PAY_TOKEN}
    payload = {"invoice_ids": invoice_id}
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        result = response.json()
        if result.get('ok') and result['result']['items']:
            return result['result']['items'][0]['status']
    except:
        return 'error'

@bot.message_handler(commands=['start'])
def send_welcome(message):
    user_id = message.from_user.id
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    
    # منوی اصلی شما با دکمه قبلی و مورد نظرتان
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
        # بررسی موجودی انبار
        if len(configs_pool) == 0:
            bot.send_message(message.chat.id, "❌ متاسفانه در حال حاضر کانفیگ موجودی نداریم. لطفا به پشتیبانی پیام دهید.")
            return
            
        bot.send_message(message.chat.id, "⏳ در حال ساخت فاکتور پرداخت...")
        
        invoice_result = create_invoice(PRICE_USD)
        if invoice_result['ok']:
            invoice_data = invoice_result['data']
            invoice_url = invoice_data['result']['pay_url']
            invoice_id = invoice_data['result']['invoice_id']
            
            markup = types.InlineKeyboardMarkup()
            btn_pay = types.InlineKeyboardButton("💳 پرداخت آنلاین (CryptoBot)", url=invoice_url)
            btn_check = types.InlineKeyboardButton("🔄 بررسی وضعیت پرداخت", callback_data=f"check_{invoice_id}")
            markup.add(btn_pay)
            markup.add(btn_check)
            
            bot.send_message(message.chat.id, f"💵 مبلغ فاکتور: {PRICE_USD} USDT (تتر)\n\nلطفاً روی دکمه زیر کلیک کنید و در ربات رسمی کریپتو واریز را انجام دهید. سپس دکمه بررسی وضعیت را بزنید:", reply_markup=markup)
        else:
            # نمایش علت دقیق خطا برای شما
            bot.send_message(message.chat.id, f"❌ خطای سیستم درگاه:\n`{invoice_result['error']}`\n\nلطفاً این متن خطا را بررسی کنید.")

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
        invoice_id = int(call.data.split("_")[1])
        status = check_invoice(invoice_id)
        
        if status == 'paid':
            if len(configs_pool) > 0:
                selected_config = configs_pool.pop(0)
                bot.answer_callback_query(call.id, "🎉 پرداخت موفقیت‌آمیز بود!")
                bot.edit_message_text(f"🎉 پرداخت شما با موفقیت تایید شد!\n\nکانفیگ شما:\n\n`{selected_config}`\n\nبرای کپی شدن روی آن ضربه بزنید.", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode='Markdown')
            else:
                bot.send_message(call.message.chat.id, "⚠️ پرداخت شما تایید شد اما انبار ربات خالی است! به پشتیبانی پیام دهید.")
        elif status == 'active':
            bot.answer_callback_query(call.id, "❌ فاکتور هنوز پرداخت نشده است!", show_alert=True)

bot.infinity_polling()
