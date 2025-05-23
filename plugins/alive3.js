const config = require('../config');
const { cmd, commands } = require('../command');

cmd({
    pattern: "alive3",
    desc: "Check bot online or no.",
    category: "main",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        // Variables
        const name = pushname || conn.getName(sender);
        const murl = 'https://whatsapp.com/channel/0029Vaan9TF9Bb62l8wpoD47';
        const img = 'https://i.imgur.com/vTs9acV.jpeg';

        // Constructing the contact message
        const con = {
            key: {
                fromMe: false,
                participant: `${sender.split('@')[0]}@s.whatsapp.net`,
                ...(isGroup ? { remoteJid: '254748387615@s.whatsapp.net' } : {}),
            },
            message: {
                contactMessage: {
                    displayName: name,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;a,;;;\nFN:${name}\nitem1.TEL;waid=${sender.split('@')[0]}:${sender.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`,
                },
            },
        };

        // Text message with context info
        const message = {
            text: "I'm Alive",
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363165918432989@newsletter',
                    newsletterName: 'SRI-BOT 🇱🇰',
                    serverMessageId: -1
                },
                mentionedJid: [sender],
                externalAdReply: {
                    title: '𝗜 𝗔𝗠 𝗔𝗟𝗶𝘃𝗲',
                    body: 'Regards Keithkeizzah',
                    thumbnailUrl: img,
                    sourceUrl: murl,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            }
        };

        // Send the message
        await conn.sendMessage(from, message, { quoted: con });

    } catch (e) {
        console.log(e);
        reply(`${e}`);
    }
});
