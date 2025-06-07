const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}

module.exports = {
    SESSION_ID: process.env.SESSION_ID,
    PREFIX: process.env.PREFIX || ".",
    OWNER_NUMBER: process.env.OWNER_NUMBER || ["94753670175"],
    ALIVE_IMG: process.env.ALIVE_IMG || "https://telegra.ph/file/ad25b2227fa2a1a01b707.jpg",
    ALIVE_MSG: process.env.ALIVE_MSG || "iyoo whats up 💫",
    AUTO_READ_STATUS: process.env.AUTO_READ_STATUS || "true",
    STATUS_SAVE: process.env.STATUS_SAVE || "true",
    MODE: process.env.MODE || "public", // bot modes (public,private,inbox,groups)
    VERSION: process.env.VERSION || "1.0.0" // Added version here
};
