# این بخش را در کد خودت جایگزین کن
@bot.message_handler(func=lambda message: True)
def handle_messages(message):
    user_id = message.from_user.id
    text = message.text

    if text == "🔑 خرید کانفیگ":
        # ساخت منوی مرتب مشابه نمونه
        markup = types.InlineKeyboardMarkup(row_width=2)
        
        # ردیف عنوان ها
        btn_title_product = types.InlineKeyboardButton("🛍️ محصول", callback_data="none")
        btn_title_price = types.InlineKeyboardButton("💵 مبلغ", callback_data="none")
        
        # ردیف های خرید
        btn1 = types.InlineKeyboardButton("۱ گیگابایت", callback_data="buy_1gb")
        btn1_p = types.InlineKeyboardButton(f"{PRICES['1gb']} $", callback_data="buy_1gb")
        
        btn3 = types.InlineKeyboardButton("۳ گیگابایت", callback_data="buy_3gb")
        btn3_p = types.InlineKeyboardButton(f"{PRICES['3gb']} $", callback_data="buy_3gb")
        
        btn5 = types.InlineKeyboardButton("۵ گیگابایت", callback_data="buy_5gb")
        btn5_p = types.InlineKeyboardButton(f"{PRICES['5gb']} $", callback_data="buy_5gb")
        
        markup.add(btn_title_product, btn_title_price)
        markup.add(btn1, btn1_p)
        markup.add(btn3, btn3_p)
        markup.add(btn5, btn5_p)
        
        bot.send_message(message.chat.id, "🛒 لطفاً محصول مورد نظر خود را انتخاب کنید:", reply_markup=markup)
    
    # ... بقیه کدهای ربات (پشتیبانی، مدیریت و غیره) دست نخورده باقی می‌ماند
