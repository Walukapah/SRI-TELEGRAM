const os = require('os');
const settings = require('../settings.js');
const config = require('../config');
const {cmd, commands} = require('../command');

function formatTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;

    return time.trim();
}

cmd({
    pattern: "ping2",
    desc: "Check bot status and response time.",
    category: "main",
    filename: __filename
},
async(conn, mek, m,{from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
    try {
        const start = Date.now();
        await conn.sendMessage(from, { text: 'Pong!' });
        const end = Date.now();
        const ping = Math.round((end - start) / 2);

        const uptimeInSeconds = process.uptime();
        const uptimeFormatted = formatTime(uptimeInSeconds);

        const botInfo = `
┏━━〔 🤖 𝐊𝐧𝐢𝐠𝐡𝐭𝐁𝐨𝐭-𝐌𝐃 〕━━┓
┃ 🚀 Ping     : ${ping} ms
┃ ⏱️ Uptime   : ${uptimeFormatted}
┃ 🔖 Version  : v${config.VERSION}
┗━━━━━━━━━━━━━━━━━━━┛`.trim();

        await conn.sendMessage(from, { text: botInfo, quoted: mek });

    } catch (error) {
        console.error('Error in ping command:', error);
        reply('❌ Failed to get bot status.');
    }
});
