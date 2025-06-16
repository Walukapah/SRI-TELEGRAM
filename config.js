const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}

module.exports = {
    SESSION_ID: process.env.SESSION_ID,
    PREFIX: process.env.PREFIX || ".",
    BOT_NAME: process.env.BOT_NAME || "SRI-BOT 🇱🇰",
    BOT_INFO: process.env.BOT_INFO || "SRI-BOT🇱🇰;WALUKA👊;https://i.imgur.com/r3GZeiX.jpeg",
    OWNER_NUMBER: process.env.OWNER_NUMBER || ["94753670175"],
    ALIVE_IMG: process.env.ALIVE_IMG || "https://telegra.ph/file/ad25b2227fa2a1a01b707.jpg",
    ALIVE_MSG: process.env.ALIVE_MSG || "iyoo whats up 💫",
    MENU_IMG_URL: process.env.MENU_IMG_URL || "https://images.weserv.nl/?url=i.imgur.com/W2CaVZW.jpeg",
    MENU_TYPE: process.env.MENU_TYPE || "small", // Menu style: big, small, image, document, text, call, payment
    AUTO_READ_STATUS: process.env.AUTO_READ_STATUS || "true",
    STATUS_SAVE: process.env.STATUS_SAVE || "true",
    NEWS_LETTER: process.env.NEWS_LETTER || "120363165918432989@newsletter",
    MODE: process.env.MODE || "groups", // bot modes (public,private,inbox,groups)
    VERSION: process.env.VERSION || "1.0.0", // Added version here
    MEDIA_URL: process.env.MEDIA_URL || "https://whatsapp.com/channel/0029VaAPzWX0G0XdhMbtRI2i"
};
