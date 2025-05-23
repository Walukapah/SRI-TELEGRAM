const config = require('../config');
const { cmd, commands } = require('../command');

cmd({
    pattern: "alive3",
    desc: "Check if bot is online",
    category: "main",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        const name = pushname || conn.getName(sender);
        const img = 'https://i.imgur.com/vTs9acV.jpeg';
        const murl = 'https://whatsapp.com/channel/0029Vaan9TF9Bb62l8wpoD47';

        const message = {
            text: `𝗜 𝗔𝗠 𝗔𝗟𝗜𝗩𝗘 𝗠𝗢𝗧𝗛𝗘𝗥𝗙𝗨𝗖𝗞𝗘𝗥\n\nRegards: Keithkeizzah`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363165918432989@newsletter',
                    newsletterName: 'SRI-BOT 🇱🇰',
                    serverMessageId: -1
                },
                externalAdReply: {
                    title: '𝗜 𝗔𝗠 𝗔𝗟𝗜𝗩𝗘',
                    body: 'Sri-Bot WhatsApp Bot',
                    thumbnailUrl: img,
                    sourceUrl: murl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                mentionedJid: [sender]
            }
        };

        await conn.sendMessage(from, message);

    } catch (e) {
        console.log(e);
        reply(`Error: ${e}`);
    }
});
