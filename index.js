require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const bot = new TelegramBot(process.env.BOT_TOKEN, {
 polling: true
});

const db = new sqlite3.Database('./database.db');

db.run(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY,
 free_used INTEGER DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 config TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS configs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT,
 config TEXT,
 used INTEGER DEFAULT 0
)
`);

const ADMIN_ID = 489450312;

bot.onText(/\/start/, (msg) => {

 const chatId = msg.chat.id;

 db.run(
  `INSERT OR IGNORE INTO users(id) VALUES(?)`,
  [chatId]
 );

 bot.sendMessage(chatId,
  '🌐 خوش اومدی',
  {
   reply_markup: {
    inline_keyboard: [
     [
      { text: '🛒 خرید اشتراک', callback_data: 'buy' }
     ],
     [
      { text: '🎁 تست رایگان', callback_data: 'free' }
     ],
     [
      { text: '📦 سرویس های من', callback_data: 'my' }
     ]
    ]
   }
  }
 );

});

bot.on('callback_query', (query) => {

 const chatId = query.message.chat.id;
 const data = query.data;

 if(data === 'buy') {

  bot.sendMessage(chatId,
   'پلن انتخاب کن',
   {
    reply_markup: {
     inline_keyboard: [
      [
       { text: '2GB - 2$', callback_data: 'buy_2' }
      ],
      [
       { text: '5GB - 4$', callback_data: 'buy_5' }
      ],
      [
       { text: '10GB - 9$', callback_data: 'buy_10' }
      ]
     ]
    }
   }
  );

 }

 if(data.startsWith('buy_')) {

  let type = '';

  if(data === 'buy_2') type = '2GB';
  if(data === 'buy_5') type = '5GB';
  if(data === 'buy_10') type = '10GB';

  db.get(
   `SELECT * FROM configs WHERE type = ? AND used = 0 LIMIT 1`,
   [type],
   (err, row) => {

    if(!row) {
     return bot.sendMessage(chatId,
      '❌ کانفیگ موجود نیست'
     );
    }

    db.run(
     `UPDATE configs SET used = 1 WHERE id = ?`,
     [row.id]
    );

    db.run(
     `INSERT INTO services(user_id, config) VALUES(?, ?)`,
     [chatId, row.config]
    );

    bot.sendMessage(chatId,
     `✅ خرید انجام شد\n\n${row.config}`
    );

   }
  );

 }

 if(data === 'free') {

  db.get(
   `SELECT * FROM users WHERE id = ?`,
   [chatId],
   (err, user) => {

    if(user.free_used === 1) {
     return bot.sendMessage(chatId,
      '❌ قبلا تست گرفتی'
     );
    }

    db.get(
     `SELECT * FROM configs WHERE type = 'FREE' AND used = 0 LIMIT 1`,
     [],
     (err, row) => {

      if(!row) {
       return bot.sendMessage(chatId,
        '❌ تست موجود نیست'
       );
      }

      db.run(
       `UPDATE configs SET used = 1 WHERE id = ?`,
       [row.id]
      );

      db.run(
       `UPDATE users SET free_used = 1 WHERE id = ?`,
       [chatId]
      );

      db.run(
       `INSERT INTO services(user_id, config) VALUES(?, ?)`,
       [chatId, row.config]
      );

      bot.sendMessage(chatId,
       `🎁 تست رایگان\n\n${row.config}`
      );

     }
    );

   }
  );

 }

 if(data === 'my') {

  db.all(
   `SELECT * FROM services WHERE user_id = ?`,
   [chatId],
   (err, rows) => {

    if(!rows.length) {
     return bot.sendMessage(chatId,
      '❌ سرویسی نداری'
     );
    }

    rows.forEach((s) => {

     bot.sendMessage(chatId,
      `📦 سرویس:\n\n${s.config}`
     );

    });

   }
  );

 }

});

let waiting = false;
let currentType = '';

bot.onText(/\/admin/, (msg) => {

 if(msg.chat.id !== ADMIN_ID) return;

 bot.sendMessage(ADMIN_ID,
  'پنل مدیریت',
  {
   reply_markup: {
    inline_keyboard: [
     [
      { text: '➕ افزودن 2GB', callback_data: 'add_2GB' }
     ],
     [
      { text: '➕ افزودن 5GB', callback_data: 'add_5GB' }
     ],
     [
      { text: '➕ افزودن 10GB', callback_data: 'add_10GB' }
     ],
     [
      { text: '➕ افزودن تست', callback_data: 'add_FREE' }
     ]
    ]
   }
  }
 );

});

bot.on('callback_query', (query) => {

 if(query.message.chat.id !== ADMIN_ID) return;

 if(query.data.startsWith('add_')) {

  currentType = query.data.replace('add_', '');

  waiting = true;

  bot.sendMessage(ADMIN_ID,
   'کانفیگ vless بفرست'
  );

 }

});

bot.on('message', (msg) => {

 if(msg.chat.id !== ADMIN_ID) return;

 if(!waiting) return;

 if(msg.text.startsWith('vless://')) {

  db.run(
   `INSERT INTO configs(type, config) VALUES(?, ?)`,
   [currentType, msg.text]
  );

  bot.sendMessage(ADMIN_ID,
   '✅ ذخیره شد'
  );

  waiting = false;

 }

});

console.log('Bot Running...');
