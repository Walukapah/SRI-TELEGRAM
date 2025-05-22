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
const { sms, downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const prefix = '.'

const ownerNumber = ['94753670175']

//===================SESSION-AUTH============================
if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
    if(!config.SESSION_ID) return console.log('Please add your session to SESSION_ID env !!')
    
    const sessdata = config.SESSION_ID;
    
    try {
        const decodedSession = Buffer.from(sessdata, 'base64').toString('utf-8');
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
  console.log("Connecting wa bot ⚡...");
  const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/auth_info_baileys/')
  var { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    logger: P({ level: 'silent' }),//silent
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
    }
  })
  
  conn.ev.on('creds.update', saveCreds)

// =============== ENHANCED MESSAGE LOGGING ===============
conn.ev.on('messages.upsert', async(mek) => {
    try {
        // Create timestamp with Sri Lanka timezone
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

        // Message separator
        console.log('\n' + '='.repeat(60));
        console.log(`📩 [${timestamp}] NEW MESSAGE RECEIVED`);
        
        const message = mek.messages[0];
        if (!message) return;

        // Sender information
        const senderJid = message.key.remoteJid;
        const isGroup = senderJid.endsWith('@g.us');
        const pushName = message.pushName || 'Unknown';
        
        // Basic message info
        console.log(`🔹 From: ${isGroup ? 'Group' : 'Private'} - ${senderJid}`);
        console.log(`🔹 Sender: ${pushName}`);
        console.log(`🔹 Message ID: ${message.key.id}`);
        
        // Message type detection
        const messageType = getContentType(message.message);
        let content = '';
        let additionalInfo = '';

        // Content extraction based on message type
        switch (messageType) {
            case 'conversation':
                content = message.message.conversation;
                break;
            case 'extendedTextMessage':
                content = message.message.extendedTextMessage.text;
                if (message.message.extendedTextMessage.contextInfo?.quotedMessage) {
                    additionalInfo += '🔹 Quoted Message: Yes\n';
                }
                break;
            case 'imageMessage':
                content = message.message.imageMessage.caption || '[Image without caption]';
                additionalInfo += `🔹 Image Dimensions: ${message.message.imageMessage.width}x${message.message.imageMessage.height}\n`;
                additionalInfo += `🔹 Image Size: ${(message.message.imageMessage.fileLength / 1024).toFixed(2)} KB\n`;
                break;
            case 'videoMessage':
                content = message.message.videoMessage.caption || '[Video without caption]';
                additionalInfo += `🔹 Video Duration: ${message.message.videoMessage.seconds}s\n`;
                additionalInfo += `🔹 Video Size: ${(message.message.videoMessage.fileLength / (1024 * 1024)).toFixed(2)} MB\n`;
                break;
            case 'audioMessage':
                content = '[Audio message]';
                additionalInfo += `🔹 Audio Duration: ${message.message.audioMessage.seconds}s\n`;
                additionalInfo += `🔹 Audio Type: ${message.message.audioMessage.mimetype || 'Unknown'}\n`;
                break;
            case 'stickerMessage':
                content = '[Sticker]';
                additionalInfo += `🔹 Sticker Emoji: ${message.message.stickerMessage.emoji || 'None'}\n`;
                additionalInfo += `🔹 Sticker Size: ${(message.message.stickerMessage.fileLength / 1024).toFixed(2)} KB\n`;
                break;
            case 'locationMessage':
                const loc = message.message.locationMessage;
                content = `📍 Location: ${loc.degreesLatitude}, ${loc.degreesLongitude}`;
                additionalInfo += `🔹 Location Name: ${loc.name || 'Not specified'}\n`;
                break;
            case 'buttonsResponseMessage':
                content = `🛑 Selected Button: ${message.message.buttonsResponseMessage.selectedButtonId}`;
                break;
            case 'reactionMessage':
                content = `Reacted with: ${message.message.reactionMessage.text}`;
                additionalInfo += `🔹 To Message ID: ${message.message.reactionMessage.key.id}\n`;
                break;
            default:
                content = `[Unhandled message type: ${messageType}]`;
        }

        // Display message content (trimmed if too long)
        console.log(`🔹 Message Type: ${messageType}`);
        if (additionalInfo) console.log(additionalInfo.trim());
        console.log(`🔹 Content Preview: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`);
        
        // Message status
        if (message.key.fromMe) {
            console.log('🔹 Status: Sent by this bot');
        }

        // Group specific info
        if (isGroup) {
            const groupMetadata = await conn.groupMetadata(senderJid).catch(e => {});
            if (groupMetadata) {
                console.log(`🔹 Group Name: ${groupMetadata.subject}`);
                console.log(`🔹 Participants: ${groupMetadata.participants.length}`);
            }
        }

        // End of message log
        console.log('='.repeat(60) + '\n');

        // Original message processing continues...
        message.message = (messageType === 'ephemeralMessage') 
            ? message.message.ephemeralMessage.message 
            : message.message;

        if (message.key && message.key.remoteJid === 'status@broadcast' && config.AUTO_READ_STATUS === "true") {
            await conn.readMessages([message.key]);
        }

      
      const m = sms(conn, message)
      const type = getContentType(message.message)
      const from = message.key.remoteJid
      const quoted = type == 'extendedTextMessage' && message.message.extendedTextMessage.contextInfo != null ? message.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
      const body = (type === 'conversation') ? message.message.conversation : (type === 'extendedTextMessage') ? message.message.extendedTextMessage.text : (type == 'imageMessage') && message.message.imageMessage.caption ? message.message.imageMessage.caption : (type == 'videoMessage') && message.message.videoMessage.caption ? message.message.videoMessage.caption : ''
      const isCmd = body.startsWith(prefix)
      const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
      const args = body.trim().split(/ +/).slice(1)
      const q = args.join(' ')
      const isGroup = from.endsWith('@g.us')
      const sender = message.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (message.key.participant || message.key.remoteJid)
      const senderNumber = sender.split('@')[0]
      const botNumber = conn.user.id.split(':')[0]
      const pushname = message.pushName || 'Sin Nombre'
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
        conn.sendMessage(from, { text: teks }, { quoted: message })
      }

      // Custom sendFileUrl function
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

      // Reaction handling
      if(senderNumber.includes("94753670175")){
        if(isReact) return
        m.react("👑")
      }

      if(senderNumber.includes("94756209082")){
        if(isReact) return
        m.react("🍆")
      }

      // Public random reactions
      const emojis = ["🌟", "🔥", "❤️", "🎉", "💞"];
      if (!isReact) {
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        m.react(randomEmoji);
      }

      // Mode checking
      if(!isOwner && config.MODE === "private") return
      if(!isOwner && isGroup && config.MODE === "inbox") return
      if(!isOwner && !isGroup && config.MODE === "groups") return

      // Command handling
      const events = require('./command')
      const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
      if (isCmd) {
        const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
        if (cmd) {
          if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: message.key }})
          try {
            cmd.function(conn, message, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
          } catch (e) {
            console.error("[PLUGIN ERROR] " + e);
          }
        }
      }

      // Event handling
      events.commands.map(async(command) => {
        if (body && command.on === "body") {
          command.function(conn, message, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
        } else if (message.q && command.on === "text") {
          command.function(conn, message, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
        } else if (
          (command.on === "image" || command.on === "photo") &&
          message.type === "imageMessage"
        ) {
          command.function(conn, message, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
        } else if (
          command.on === "sticker" &&
          message.type === "stickerMessage"
        ) {
          command.function(conn, message, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
        }
      });

    } catch (error) {
      console.error('ERROR IN MESSAGE PROCESSING:', error);
    }
  })
}

// Express server
app.get("/", (req, res) => {
  res.send("hey, bot started✅");
});

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

// Start bot with delay
setTimeout(() => {
  connectToWA()
}, 4000);
