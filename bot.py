import telebot
from telebot import types
import os

BOT_TOKEN = os.environ["BOT_TOKEN"]
WEB_APP_URL = os.environ["WEB_APP_URL"]

bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=["start"])
def start(message):
    kb = types.InlineKeyboardMarkup()
    web = types.WebAppInfo(url=WEB_APP_URL)
    kb.add(types.InlineKeyboardButton("🚀 فتح التطبيق", web_app=web))
    bot.send_message(message.chat.id, "اضغط لفتح التطبيق 👇", reply_markup=kb)

bot.infinity_polling()
