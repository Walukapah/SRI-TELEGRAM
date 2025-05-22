const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason,
jidNormalizedUser,
getContentType,
fetchLatestBaileysVersion,
Browsers
} = require('@whiskeysockets/baileys')

const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
const fs = require('fs')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const util = require('util')
const { sms,downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const prefix = '.'

const ownerNumber = ['94753670175']

//===================SESSION-AUTH============================
/**
if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
if(!config.SESSION_ID) return console.log('Please add your session to SESSION_ID env !!')
const sessdata = config.SESSION_ID
const filer = File.fromURL(`https://mega.nz/file/${sessdata}`)
filer.download((err, data) => {
if(err) throw err
fs.writeFile(__dirname + '/auth_info_baileys/creds.json', data, () => {
console.log("Session downloaded ✅")
})})}
**/
if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
    if(!config.SESSION_ID) return console.log('Please add your session to SESSION_ID env !!')
    
    const sessdata = config.SESSION_ID;
    
    try {
        // The session data appears to be base64 encoded JSON
        const decodedSession = Buffer.from(sessdata, 'base64').toString('utf-8');
        
        // Write the decoded session data to creds.json
        fs.writeFileSync(__dirname + '/auth_info_baileys/creds.json', decodedSession);
        console.log("Session created successfully ✅");
    } catch(err) {
        console.error("Error processing session:", err);
        throw err;
    }
}

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;

//=============================================

async function connectToWA() {
console.log("Connecting wa bot 🧬...");
const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/auth_info_baileys/')
var { version } = await fetchLatestBaileysVersion()

const conn = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        syncFullHistory: true,
        auth: state,
        version
        })
    
conn.ev.on('connection.update', (update) => {
const { connection, lastDisconnect } = update
if (connection === 'close') {
if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
            // Add 5 second delay before reconnecting
            setTimeout(() => {
                console.log('Reconnecting after disconnect...')
                connectToWA()
            }, 5000)
}
} else if (connection === 'open') {
console.log('😼 Installing... ')
const path = require('path');
fs.readdirSync("./plugins/").forEach((plugin) => {
if (path.extname(plugin).toLowerCase() == ".js") {
require("./plugins/" + plugin);
}
});
console.log('Plugins installed successful ✅')
console.log('Bot connected to whatsapp ✅')

//let up = `Wa-BOT connected successful ✅\n\nPREFIX: ${prefix}`;
//conn.sendMessage(ownerNumber + "@s.whatsapp.net", { image: { url: `https://telegra.ph/file/900435c6d3157c98c3c88.jpg` }, caption: up })

}
})
conn.ev.on('creds.update', saveCreds)  

conn.ev.on('messages.upsert', async (mek) => {
    try {
        // ====================== DETAILED LOGGING ======================
        const timestamp = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Colombo',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        console.log('\n' + '='.repeat(50));
        console.log(`📩 [${timestamp}] NEW MESSAGE RECEIVED`);
        
        const message = mek.messages[0];
        if (!message) return;

        // Basic message info
        console.log(`🔹 From: ${message.key.remoteJid}`);
        console.log(`🔹 Sender: ${message.pushName || 'Unknown'}`);
        console.log(`🔹 Message ID: ${message.key.id}`);
        console.log(`🔹 Is Group? ${message.key.remoteJid.endsWith('@g.us') ? 'Yes' : 'No'}`);

        // Message type detection
        const messageType = getContentType(message.message);
        console.log(`🔹 Message Type: ${messageType}`);

        // Message content extraction
        let content = '';
        switch (messageType) {
            case 'conversation':
                content = message.message.conversation;
                break;
            case 'extendedTextMessage':
                content = message.message.extendedTextMessage.text;
                if (message.message.extendedTextMessage.contextInfo?.quotedMessage) {
                    console.log('🔹 This is a quoted reply');
                }
                break;
            case 'imageMessage':
                content = message.message.imageMessage.caption || '[Image without caption]';
                console.log(`🔹 Image URL: ${message.message.imageMessage.url || 'Not available'}`);
                break;
            case 'videoMessage':
                content = message.message.videoMessage.caption || '[Video without caption]';
                console.log(`🔹 Video Duration: ${message.message.videoMessage.seconds}s`);
                break;
            case 'audioMessage':
                console.log(`🔹 Audio Duration: ${message.message.audioMessage.seconds}s`);
                content = '[Audio message]';
                break;
            case 'stickerMessage':
                content = '[Sticker]';
                console.log(`🔹 Sticker Emoji: ${message.message.stickerMessage.emoji || 'None'}`);
                break;
            case 'locationMessage':
                const loc = message.message.locationMessage;
                content = `📍 Location: ${loc.degreesLatitude}, ${loc.degreesLongitude}`;
                break;
            case 'buttonsResponseMessage':
                content = `🛑 Selected Button: ${message.message.buttonsResponseMessage.selectedButtonId}`;
                break;
            default:
                content = `[Unhandled message type: ${messageType}]`;
        }

        console.log(`🔹 Content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
        
        if (message.key.fromMe) {
            console.log('🔹 Status: Sent by this bot');
        }

        // Log reactions
        if (message.message?.reactionMessage) {
            const reaction = message.message.reactionMessage;
            console.log(`🔹 Reaction: ${reaction.text} to message ${reaction.key.id}`);
        }

        console.log('='.repeat(50) + '\n');

        // ====================== ORIGINAL MESSAGE PROCESSING ======================
        message.message = (messageType === 'ephemeralMessage') 
            ? message.message.ephemeralMessage.message 
            : message.message;

        if (message.key && message.key.remoteJid === 'status@broadcast' && config.AUTO_READ_STATUS === "true") {
            await conn.readMessages([message.key]);
        }

        // ... rest of your existing message processing code ...

    } catch (error) {
        console.error('ERROR IN MESSAGE LOGGING:', error);
    }
});
    
const m = sms(conn, mek)
const type = getContentType(mek.message)
const content = JSON.stringify(mek.message)
const from = mek.key.remoteJid
const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
const isCmd = body.startsWith(prefix)
const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
const args = body.trim().split(/ +/).slice(1)
const q = args.join(' ')
const isGroup = from.endsWith('@g.us')
const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
const senderNumber = sender.split('@')[0]
const botNumber = conn.user.id.split(':')[0]
const pushname = mek.pushName || 'Sin Nombre'
const isMe = botNumber.includes(senderNumber)
const isOwner = ownerNumber.includes(senderNumber) || isMe
const botNumber2 = await jidNormalizedUser(conn.user.id);
const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : ''
const groupName = isGroup ? groupMetadata.subject : ''
const participants = isGroup ? await groupMetadata.participants : ''
const groupAdmins = isGroup ? await getGroupAdmins(participants) : ''
const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false
const isAdmins = isGroup ? groupAdmins.includes(sender) : false
const isReact = m.message.reactionMessage ? true : false
const reply = (teks) => {
conn.sendMessage(from, { text: teks }, { quoted: mek })
}

conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
              let mime = '';
              let res = await axios.head(url)
              mime = res.headers['content-type']
              if (mime.split("/")[1] === "gif") {
                return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options }, { quoted: quoted, ...options })
              }
              let type = mime.split("/")[0] + "Message"
              if (mime === "application/pdf") {
                return conn.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption: caption, ...options }, { quoted: quoted, ...options })
              }
              if (mime.split("/")[0] === "image") {
                return conn.sendMessage(jid, { image: await getBuffer(url), caption: caption, ...options }, { quoted: quoted, ...options })
              }
              if (mime.split("/")[0] === "video") {
                return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, mimetype: 'video/mp4', ...options }, { quoted: quoted, ...options })
              }
              if (mime.split("/")[0] === "audio") {
                return conn.sendMessage(jid, { audio: await getBuffer(url), caption: caption, mimetype: 'audio/mpeg', ...options }, { quoted: quoted, ...options })
              }
            }

//=================REACT_MESG========================================================================
if(senderNumber.includes("94753670175")){
if(isReact) return
m.react("👑")
}

if(senderNumber.includes("94756209082")){
if(isReact) return
m.react("🍆")
}

//================publicreact with random emoji
const emojis = ["🌟", "🔥", "❤️", "🎉", "💞"];
if (!isReact) {
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  m.react(randomEmoji);
}
//==========================

//=====================================================================================================
        
//==================work-type=====================================================================================================================================

if(!isOwner && config.MODE === "private") return
if(!isOwner && isGroup && config.MODE === "inbox") return
if(!isOwner && !isGroup && config.MODE === "groups") return

//==============================================================================================================================================================
        
const events = require('./command')
const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
if (isCmd) {
const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
if (cmd) {
if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key }})

try {
cmd.function(conn, mek, m,{from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
} catch (e) {
console.error("[PLUGIN ERROR] " + e);
}
}
}
events.commands.map(async(command) => {
if (body && command.on === "body") {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
} else if (mek.q && command.on === "text") {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
} else if (
(command.on === "image" || command.on === "photo") &&
mek.type === "imageMessage"
) {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
} else if (
command.on === "sticker" &&
mek.type === "stickerMessage"
) {
command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
}});
//============================================================================ 

})
}
app.get("/", (req, res) => {
res.send("hey, bot started✅");
});
app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));
setTimeout(() => {
connectToWA()
}, 4000);  
