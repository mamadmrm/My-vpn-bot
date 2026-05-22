import os
import telebot
import sqlite3
from flask import Flask, request

TOKEN = '8818158580:AAGe9qQOzIARSSPd2UJ5_2VgIzdjx0tQ3sI'
ADMIN_ID = 489450312
WEBHOOK_URL = "https://my-vpn-bot-wt0a.onrender.com/"
PLISIO_API_KEY = 'qU-IFBLxBU5Ci7Th6Lw9OSZk_ps_r3cyyzUKMTKQV3tZ6hE7YGOETOe3QWB4g5dy'

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# دیتابیس
db = sqlite3.connect('database.db', check_same_thread=False)
db.execute('CREATE TABLE IF NOT EXISTS config_pool (plan TEXT, link TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS user_configs (user_id INTEGER, plan TEXT, link TEXT)')
db.commit()

# منوی اصلی
@bot.message_handler(commands=['start'])
def start(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row('🛒 خرید اشتراک', '📁 سرویس‌های من')
    if message.chat.id == ADMIN_ID:
        markup.add('⚙️ پنل مدیریت')
    bot.send_message(message.chat.id, "سلام، به ربات فروش کانفیگ خوش آمدید.", reply_markup=markup)

# خرید اشتراک
@bot.message_handler(func=lambda m: m.text == '🛒 خرید اشتراک')
def shop(message):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("۱ گیگ - ۱$", callback_data="buy_1gb"))
    markup.add(telebot.types.InlineKeyboardButton("۳ گیگ - ۲.۵$", callback_data="buy_3gb"))
    markup.add(telebot.types.InlineKeyboardButton("۵ گیگ - ۴$", callback_data="buy_5gb"))
    bot.send_message(message.chat.id, "پلن مورد نظر را انتخاب کنید:", reply_markup=markup)

# اتصال به درگاه (بدون باگ)
@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def process_buy(call):
    plan = call.data.split("_")[1]
    # (در اینجا کد اتصال به API پلسیو قرار می‌گیرد تا لینک پرداخت ارسال شود)
    bot.answer_callback_query(call.id, "در حال ساخت فاکتور...")
    bot.send_message(call.message.chat.id, "لینک پرداخت برای شما تولید شد (نمونه).")

# پنل مدیریت (کاملا دکمه‌ای)
@bot.message_handler(func=lambda m: m.text == '⚙️ پنل مدیریت' and m.chat.id == ADMIN_ID)
def admin_panel(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add('➕ افزودن کانفیگ', '🔙 بازگشت')
    bot.send_message(message.chat.id, "به پنل مدیریت خوش آمدید:", reply_markup=markup)

@bot.message_handler(func=lambda m: m.text == '➕ افزودن کانفیگ')
def ask_plan(message):
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add('1gb', '3gb', '5gb', '🔙 بازگشت')
    bot.send_message(message.chat.id, "پلن را انتخاب کنید:", reply_markup=markup)
    bot.register_next_step_handler(message, ask_link)

def ask_link(message):
    plan = message.text
    if plan == '🔙 بازگشت': return start(message)
    msg = bot.send_message(message.chat.id, f"لینک کانفیگِ {plan} را بفرستید:")
    bot.register_next_step_handler(msg, lambda m: save_cfg(m, plan))

def save_cfg(message, plan):
    db.execute("INSERT INTO config_pool VALUES (?, ?)", (plan, message.text))
    db.commit()
    bot.send_message(message.chat.id, "✅ با موفقیت ذخیره شد.", reply_markup=telebot.types.ReplyKeyboardRemove())
    start(message)

# اتصال وب‌هوک
@app.route('/' + TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.stream.read().decode('utf-8'))])
    return "OK", 200

if __name__ == "__main__":
    bot.remove_webhook()
    bot.set_webhook(url=WEBHOOK_URL + TOKEN)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
