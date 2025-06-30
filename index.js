const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    isJidBroadcast,
    getContentType,
    proto,
    generateWAMessageContent,
    generateWAMessage,
    AnyMessageContent,
    prepareWAMessageMedia,
    areJidsSameUser,
    downloadContentFromMessage,
    MessageRetryMap,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    generateMessageID, 
    makeInMemoryStore,
    jidDecode,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys')

const { Telegraf } = require('telegraf')
const l = console.log
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
const fs = require('fs')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const util = require('util')
const { sms, downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const prefix = config.PREFIX
const ownerNumber = config.OWNER_NUMBER

// Telegram Bot Setup
const telegramToken = '7355024353:AAFcH-OAF5l5Fj6-igY4jOtqZ7HtZGRrlYQ'
const bot = new Telegraf(telegramToken)
const pairingRequests = new Map()

// Express server setup
const express = require("express")
const app = express()
const port = process.env.PORT || 8000

async function connectToWA() {
    console.log("Connecting WhatsApp bot 🧬...")
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

    // Telegram Bot Commands
    bot.command('start', (ctx) => {
        ctx.replyWithMarkdown(`
🤖 *WhatsApp Bot Deployment*

Available commands:
/pair <number> - Get WhatsApp pairing code
/status - Check bot connection status
/restart - Restart the WhatsApp connection
        `)
    })

    bot.command('pair', async (ctx) => {
        const userId = ctx.from.id
        const args = ctx.message.text.split(' ')
        
        if (args.length < 2) {
            return ctx.reply('Please provide a phone number with country code\nExample: /pair 94712345678')
        }

        const phoneNumber = args[1].replace(/[^0-9]/g, '') // Clean phone number
        
        // Validate phone number format
        if (!phoneNumber.match(/^\d{10,15}$/)) {
            return ctx.reply('Invalid phone number format. Please provide number with country code\nExample: 94712345678')
        }

        try {
            if (!state.creds.registered) {
                pairingRequests.set(userId, { 
                    phoneNumber: phoneNumber + '@s.whatsapp.net',
                    timestamp: Date.now()
                })

                const code = await conn.requestPairingCode(phoneNumber + '@s.whatsapp.net')
                
                await ctx.telegram.sendMessage(
                    userId, 
                    `🔐 *Your WhatsApp pairing code:*\n\n\`${code}\`\n\nUse this within 2 minutes to pair your device.`,
                    { parse_mode: 'Markdown' }
                )
                
                ctx.reply('✅ Pairing code sent to your private chat!')
                
                // Remove pairing request after 2 minutes
                setTimeout(() => {
                    if (pairingRequests.has(userId)) {
                        pairingRequests.delete(userId)
                        ctx.telegram.sendMessage(userId, '⌛ Pairing code has expired. Please request a new one if needed.')
                    }
                }, 120000)
            } else {
                ctx.reply('⚠️ This session is already registered!')
            }
        } catch (error) {
            console.error('Pairing error:', error)
            ctx.reply('❌ Failed to generate pairing code. Please try again.')
        }
    })

    bot.command('status', (ctx) => {
        const status = conn.user ? '✅ Connected to WhatsApp' : '❌ Disconnected from WhatsApp'
        const userInfo = conn.user ? 
            `\n\n*User Info:*\n- ID: ${conn.user.id}\n- Name: ${conn.user.name || 'Not available'}` : 
            ''
        ctx.replyWithMarkdown(`*Bot Status:*\n\n${status}${userInfo}`)
    })

    bot.command('restart', async (ctx) => {
        try {
            await ctx.reply('🔄 Restarting WhatsApp connection...')
            await conn.end()
            setTimeout(connectToWA, 3000)
            ctx.reply('✅ WhatsApp connection restarted successfully!')
        } catch (error) {
            ctx.reply('❌ Failed to restart connection: ' + error.message)
        }
    })

    // WhatsApp Connection Events
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
            console.log('😼 Installing plugins...')
            const path = require('path')
            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() == ".js") {
                    require("./plugins/" + plugin)
                }
            })
            
            console.log('Plugins installed successfully ✅')
            console.log('Bot connected to WhatsApp ✅')
            
            // Notify all users who requested pairing
            pairingRequests.forEach((request, userId) => {
                bot.telegram.sendMessage(
                    userId,
                    '✅ WhatsApp connection established successfully!'
                ).catch(console.error)
            })
            pairingRequests.clear()
        }
    })

    // WhatsApp Message Handling
    conn.ev.on('messages.upsert', async (mek) => {
        mek = mek.messages[0]
        if (!mek.message) return
        mek.message = (getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message

        const m = sms(conn, mek)
  const type = getContentType(mek.message)
  const content = JSON.stringify(mek.message)
  const from = mek.key.remoteJid
  const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
  const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
  const isCmd = body.startsWith(prefix)
  var budy = typeof mek.text == 'string' ? mek.text : false;
  const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
  const args = body.trim().split(/ +/).slice(1)
  const q = args.join(' ')
  const text = args.join(' ')
  const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us')

// Then use:
const isGroup = isGroupJid(from)
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

//========== WORK TYPE ============ 
// index.js (සංශෝධිත)
if (config.MODE === "private" && !isOwner) return;
if (config.MODE === "inbox" && isGroup) return;
if (config.MODE === "groups" && !isGroup) return;
    

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
 
//const emojis = ["🌟", "🔥", "❤️", "🎉", "💞"];
//if (!isReact) {
//  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
//  m.react(randomEmoji);
//}

//==========================

    
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

    // Start Telegram bot
    bot.launch().then(() => {
        console.log('Telegram bot started successfully ✅')
    }).catch(err => {
        console.error('Telegram bot failed to start:', err)
    })

    // Clean up on exit
    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))

    conn.ev.on('creds.update', saveCreds)
}

// Start the application
app.get("/", (req, res) => {
    res.send("WhatsApp Bot is running ✅")
})

app.listen(port, () => {
    console.log(`Server listening on port http://localhost:${port}`)
    setTimeout(() => {
        connectToWA()
    }, 4000)
})
