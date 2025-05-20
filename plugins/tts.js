const config = require('../config');
const {cmd, commands} = require('../command');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');

cmd({
    pattern: "tts",
    desc: "Convert text to speech audio",
    category: "main",//utility
    filename: __filename,
    usage: ".tts <text> or .tts <language_code> <text>"
},
async(conn, mek, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
    try {
        if (!q) {
            return reply("Please provide text for TTS conversion.\nExample: .tts hello or .tts es hola");
        }

        // Check if first word is a language code (2 letters)
        const possibleLang = args[0];
        let text = q;
        let language = 'en'; // default language
        
        if (possibleLang && possibleLang.length === 2 && !possibleLang.match(/[0-9]/)) {
            language = possibleLang;
            text = args.slice(1).join(' ');
        }

        const fileName = `tts-${Date.now()}.mp3`;
        const filePath = path.join(__dirname, '..', 'assets', fileName);

        const gtts = new gTTS(text, language);
        gtts.save(filePath, async function (err) {
            if (err) {
                reply('Error generating TTS audio.');
                return;
            }

            await conn.sendMessage(from, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg'
            });

            fs.unlinkSync(filePath);
        });
    } catch(e) {
        console.log(e);
        reply(`Error: ${e}`);
    }
});
