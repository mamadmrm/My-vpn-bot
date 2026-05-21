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
        "description": "خرید سرویس ۱ ماهه اختصاصی",
        "paid_btn_name": "callback",
        "paid_btn_url": f"https://t.me/vpn_mirza_bot"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return response.json()
    except:
        return {"ok": False}

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
    
    # منوی اصلی دقیقاً مثل عکس اول شما
    btn_buy = types.KeyboardButton("🔑 خرید اشتراک")
    btn_wallet = types.KeyboardButton("💳 کیف پول + شارژ")
    btn_my_services = types.KeyboardButton("🛍 سرویس‌های من")
    btn_support = types.KeyboardButton("☎️ پشتیبانی")
    
    markup.add(btn_buy)
    markup.add(btn_wallet, btn_my_services)
    markup.add(btn_support)
    
    if user_id == ADMIN_ID:
        btn_admin = types.KeyboardButton("⚙️ پنل مدیریت (افزودن کانفیگ)")
        markup.add(btn_admin)
        
    bot.send_message(message.chat.id, "به ربات جت وی‌پی‌ان خوش آمدید! لطفا یک گزینه را انتخاب کنید:", reply_markup=markup)

@bot.message_handler(func=lambda message: True)
def handle_messages(message):
    user_id = message.from_user.id
    text = message.text

    if text == "🔑 خرید اشتراک":
        markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
        btn_plan1 = types.KeyboardButton("🚀 سرویس ۱ ماهه (تک کاربره)")
        btn_back = types.KeyboardButton("↩️ بازگشت به منوی قبل")
        markup.add(btn_plan1)
        markup.add(btn_back)
        bot.send_message(message.chat.id, "📌 دسته بندی خود را انتخاب نمایید:", reply_markup=markup)

    elif text == "↩️ بازگشت به منوی قبل":
        send_welcome(message)

    elif text == "🚀 سرویس ۱ ماهه (تک کاربره)":
        if len(configs_pool) == 0:
            bot.send_message(message.chat.id, "❌ متاسفانه در حال حاضر کانفیگ موجودی نداریم. لطفا بعداً سر بزنید.")
            return
            
        bot.send_message(message.chat.id, "⏳ در حال ساخت فاکتور پرداخت کریپتو...")
        
        invoice_data = create_invoice(PRICE_USD)
        if invoice_data.get('ok'):
            invoice_url = invoice_data['result']['pay_url']
            invoice_id = invoice_data['result']['invoice_id']
            
            markup = types.InlineKeyboardMarkup()
            btn_pay = types.InlineKeyboardButton("💳 پرداخت آنلاین (CryptoBot)", url=invoice_url)
            btn_check = types.InlineKeyboardButton("🔄 بررسی وضعیت پرداخت", callback_data=f"check_{invoice_id}")
            markup.add(btn_pay)
            markup.add(markup.add(btn_check))
            
            bot.send_message(message.chat.id, f"💵 مبلغ فاکتور: {PRICE_USD} USDT (تتر)\n\nلطفاً روی دکمه زیر کلیک کنید و در ربات رسمی کریپتو واریز را انجام دهید:", reply_markup=markup)
        else:
            bot.send_message(message.chat.id, "❌ خطایی در ارتباط با درگاه رخ داد. لطفا دوباره تلاش کنید.")

    elif text == "☎️ پشتیبانی":
        bot.send_message(message.chat.id, f"جهت ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{SUPPORT_ID}")
        
    elif text in ["💳 کیف پول + شارژ", "🛍 سرویس‌های من"]:
        bot.send_message(message.chat.id, "⚠️ این بخش بعد از خرید اتوماتیک فعال می‌شود.")

    elif text == "⚙️ پنل مدیریت (افزودن کانفیگ)" and user_id == ADMIN_ID:
        markup = types.ForceReply(selective=False)
        bot.send_message(message.chat.id, f"📦 موجودی انبار: {len(configs_pool)} کانفیگ\n\nکانفیگ‌ها را بفرستید (هر کدام در یک خط):", reply_markup=markup)
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
                bot.edit_message_text(f"🎉 پرداخت شما با موفقیت تایید شد!\n\nکانفیگ شما:\n\n`{selected_config}`", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode='Markdown')
                bot.send_message(ADMIN_ID, f"💰 یک فروش موفق انجام شد! موجودی انبار: {len(configs_pool)}")
            else:
                bot.send_message(call.message.chat.id, "⚠️ پرداخت تایید شد اما انبار خالی است! به پشتیبانی پیام دهید.")
        elif status == 'active':
            bot.answer_callback_query(call.id, "❌ فاکتور هنوز پرداخت نشده است!", show_alert=True)

bot.infinity_polling()
