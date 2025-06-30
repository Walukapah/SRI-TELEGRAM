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
const readline = require('readline')

// Telegram Bot Setup
const TelegramBot = require('node-telegram-bot-api')
const telegramToken = '7355024353:AAFcH-OAF5l5Fj6-igY4jOtqZ7HtZGRrlYQ'
const telegramBot = new TelegramBot(telegramToken, {polling: true})

// User session tracking
const userSessions = new Map() // Stores Telegram user ID -> WhatsApp session info
const pairingCodes = new Map() // Stores phone number -> pairing code
const activeSessions = new Set() // Tracks active WhatsApp numbers

// Pairing code generator
function generatePairingCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Readline interface for terminal input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

// Telegram Bot Commands
telegramBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  telegramBot.sendMessage(chatId, 
    `🤖 Welcome to WhatsApp Pairing Bot!\n\n` +
    `Use /pair [WhatsAppNumber] to connect your WhatsApp account.\n` +
    `Example: /pair 94771234567\n\n` +
    `Use /logout to disconnect your session`
  )
})

telegramBot.onText(/\/pair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const phoneNumber = match[1].trim()
  
  // Validate phone number format
  if (!/^[0-9]{9,15}$/.test(phoneNumber)) {
    return telegramBot.sendMessage(chatId, '❌ Invalid phone number format. Please use format: /pair 94771234567')
  }
  
  // Check if user already has an active session
  if (userSessions.has(userId)) {
    return telegramBot.sendMessage(chatId, '❌ You already have an active session. Only one session per user is allowed.')
  }
  
  // Check if this number is already paired
  if (activeSessions.has(phoneNumber)) {
    return telegramBot.sendMessage(chatId, '❌ This WhatsApp number is already connected to another Telegram account.')
  }
  
  // Generate pairing code
  const code = generatePairingCode()
  pairingCodes.set(phoneNumber, { code, chatId, userId })
  
  telegramBot.sendMessage(chatId, 
    `🔑 Your WhatsApp pairing code: *${code}*\n\n` +
    `1. Open WhatsApp on your phone\n` +
    `2. Go to Settings → Linked Devices → Link a Device\n` +
    `3. Enter this 6-digit code when prompted\n\n` +
    `⚠️ This code will expire in 5 minutes.`, 
    { parse_mode: 'Markdown' }
  )
  
  // Set code expiration
  setTimeout(() => {
    if (pairingCodes.get(phoneNumber)?.code === code) {
      pairingCodes.delete(phoneNumber)
      telegramBot.sendMessage(chatId, '❌ Pairing code expired. Please generate a new one with /pair')
    }
  }, 5 * 60 * 1000)
})

// Main WhatsApp client function
const clientstart = async(phoneNumber, pairingCode) => {
  const store = makeInMemoryStore({
    logger: P().child({ 
      level: 'silent',
      stream: 'store' 
    })
  })
  
  const authDir = `./auth_info_baileys_${phoneNumber}`
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir)
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version, isLatest } = await fetchLatestBaileysVersion()
  
  const client = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: !config.status.terminal,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.00"],
    version,
    // For pairing code authentication
    async getPairingCode(code) {
      if (pairingCode && code === pairingCode) {
        return { accept: true }
      }
      return { accept: false }
    }
  })

  store.bind(client.ev)

  // Handle connection updates
  client.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    
    // Handle QR code generation
    if (qr && !client.authState.creds.registered) {
      const pairingInfo = pairingCodes.get(phoneNumber)
      if (pairingInfo) {
        qrcode.generate(qr, { small: true }, (qrCode) => {
          telegramBot.sendMessage(pairingInfo.chatId, 
            `⚠️ Couldn't verify pairing code. Please scan this QR code instead:\n\n\`\`\`${qrCode}\`\`\``,
            { parse_mode: 'Markdown' }
          )
        })
      }
    }
    
    if (connection === 'close') {
      if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          console.log('Reconnecting after disconnect...')
          clientstart(phoneNumber)
        }, 5000)
      } else {
        // Clean up on logout
        activeSessions.delete(phoneNumber)
        const userSession = Array.from(userSessions.entries())
          .find(([_, session]) => session.phoneNumber === phoneNumber)
        if (userSession) {
          userSessions.delete(userSession[0])
        }
      }
    } 
    else if (connection === 'open') {
      console.log(`😼 WhatsApp bot connected for ${phoneNumber}`)
      
      // Load plugins
      const path = require('path')
      fs.readdirSync("./plugins/").forEach((plugin) => {
        if (path.extname(plugin).toLowerCase() == ".js") {
          require("./plugins/" + plugin)
        }
      })
      
      console.log('Plugins installed successfully ✅')
      
      // Notify Telegram user
      const pairingInfo = pairingCodes.get(phoneNumber)
      if (pairingInfo) {
        telegramBot.sendMessage(pairingInfo.chatId, 
          `✅ WhatsApp account successfully connected!\n\n` +
          `You can now use your WhatsApp bot.\n\n` +
          `ℹ️ Number: ${phoneNumber}\n` +
          `📛 To disconnect, use /logout`
        )
        
        // Store user session
        userSessions.set(pairingInfo.userId, {
          phoneNumber,
          client
        })
        activeSessions.add(phoneNumber)
        pairingCodes.delete(phoneNumber)
      }
    }
  })

  // Handle credentials update
  client.ev.on('creds.update', saveCreds)

  // Handle messages
  client.ev.on('messages.upsert', async (mek) => {
    mek = mek.messages[0]
    if (!mek.message) return
    mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message

    const reset = "\x1b[0m"
    const red = "\x1b[31m"
    const green = "\x1b[32m"
    const blue = "\x1b[34m"
    const cyan = "\x1b[36m"
    const bold = "\x1b[1m"

    // Auto mark as seen
    if (config.MARK_AS_SEEN === 'true') {
      try {
        await client.sendReadReceipt(mek.key.remoteJid, mek.key.id, [mek.key.participant || mek.key.remoteJid])
        console.log(green + `Marked message from ${mek.key.remoteJid} as seen.` + reset)
      } catch (error) {
        console.error(red + "Error marking message as seen:", error + reset)
      }
    }

    // Auto read messages
    if (config.READ_MESSAGE === 'true') {
      try {
        await client.readMessages([mek.key])
        console.log(green + `Marked message from ${mek.key.remoteJid} as read.` + reset)
      } catch (error) {
        console.error(red + "Error marking message as read:", error + reset)
      }
    }

    // Status updates handling
    if (mek.key && mek.key.remoteJid === 'status@broadcast') {
      // Auto read Status  
      if (config.AUTO_READ_STATUS === "true") {  
        try {  
          await client.readMessages([mek.key])  
          console.log(green + `Status from ${mek.key.participant || mek.key.remoteJid} marked as read.` + reset)  
        } catch (error) {  
          console.error(red + "Error reading status:", error + reset)  
        }  
      }  

      // Auto react to Status  
      if (config.AUTO_REACT_STATUS === "true") {  
        try {  
          await client.sendMessage(  
            mek.key.participant || mek.key.remoteJid,  
            { react: { text: config.AUTO_REACT_STATUS_EMOJI, key: mek.key } }  
          )  
          console.log(green + `Reacted to status from ${mek.key.participant || mek.key.remoteJid}` + reset)  
        } catch (error) {  
          console.error(red + "Error reacting to status:", error + reset)  
        }  
      }  
      return
    }

    const m = sms(client, mek)
    const type = getContentType(mek.message)
    const content = JSON.stringify(mek.message)
    const from = mek.key.remoteJid
    const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
    const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
    const isCmd = body.startsWith(prefix)
    var budy = typeof mek.text == 'string' ? mek.text : false
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
    const args = body.trim().split(/ +/).slice(1)
    const q = args.join(' ')
    const text = args.join(' ')
    const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us')

    const isGroup = isGroupJid(from)
    const sender = mek.key.fromMe ? (client.user.id.split(':')[0]+'@s.whatsapp.net' || client.user.id) : (mek.key.participant || mek.key.remoteJid)
    const senderNumber = sender.split('@')[0]
    const botNumber = client.user.id.split(':')[0]
    const pushname = mek.pushName || 'Sin Nombre'
    const isMe = botNumber.includes(senderNumber)
    const isOwner = ownerNumber.includes(senderNumber) || isMe
    const botNumber2 = await jidNormalizedUser(client.user.id)
    const groupMetadata = isGroup ? await client.groupMetadata(from).catch(e => {}) : ''
    const groupName = isGroup ? groupMetadata.subject : ''
    const participants = isGroup ? await groupMetadata.participants : ''
    const groupAdmins = isGroup ? await getGroupAdmins(participants) : ''
    const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false
    const isAdmins = isGroup ? groupAdmins.includes(sender) : false
    const isReact = m.message.reactionMessage ? true : false
    const reply = (teks) => {
      client.sendMessage(from, { text: teks }, { quoted: mek })
    }

    // Work type restrictions
    if (config.MODE === "private" && !isOwner) return
    if (config.MODE === "inbox" && isGroup) return
    if (config.MODE === "groups" && !isGroup) return

    // Message reaction logic
    if(senderNumber.includes("94753670175")){
      if(isReact) return
      m.react("👑")
    }

    if(senderNumber.includes("94756209082")){
      if(isReact) return
      m.react("🍆")
    }

    // Command handling
    const events = require('./command')
    const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false
    if (isCmd) {
      const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
      if (cmd) {
        if (cmd.react) client.sendMessage(from, { react: { text: cmd.react, key: mek.key }})

        try {
          cmd.function(client, mek, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
        } catch (e) {
          console.error("[PLUGIN ERROR] " + e)
        }
      }
    }
    
    events.commands.map(async(command) => {
      if (body && command.on === "body") {
        command.function(client, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
      } else if (mek.q && command.on === "text") {
        command.function(client, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
      } else if (
        (command.on === "image" || command.on === "photo") &&
        mek.type === "imageMessage"
      ) {
        command.function(client, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
      } else if (
        command.on === "sticker" &&
        mek.type === "stickerMessage"
      ) {
        command.function(client, mek, m, {from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
      }
    })
  })

  return client
}

// Telegram logout command
telegramBot.onText(/\/logout/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (userSessions.has(userId)) {
    const session = userSessions.get(userId)
    session.client.logout()
    userSessions.delete(userId)
    activeSessions.delete(session.phoneNumber)
    telegramBot.sendMessage(chatId, '✅ Successfully logged out. Your WhatsApp session has been disconnected.')
  } else {
    telegramBot.sendMessage(chatId, '❌ No active session found.')
  }
})

// Express server setup
const express = require("express")
const app = express()
const port = process.env.PORT || 8000

app.get("/", (req, res) => {
  res.send("WhatsApp-Telegram Bridge is running ✅")
})

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`))

// Handle pairing code authentication
telegramBot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return
  
  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text.trim()
  
  // Check if this is a pairing code attempt
  const pairingInfo = Array.from(pairingCodes.entries())
    .find(([_, info]) => info.chatId === chatId && info.userId === userId)
  
  if (pairingInfo && text.length === 6 && /^\d+$/.test(text)) {
    const [phoneNumber, info] = pairingInfo
    
    if (text === info.code) {
      // Start WhatsApp connection with pairing code
      clientstart(phoneNumber, text)
    } else {
      telegramBot.sendMessage(chatId, '❌ Invalid pairing code. Please try again.')
    }
  }
})

// Terminal pairing option
if (config.status.terminal) {
  (async () => {
    const phoneNumber = await question('/> please enter your WhatsApp number, starting with 62:\n> number: ')
    const code = await client.requestPairingCode(phoneNumber)
    console.log(`your pairing code: ${code}`)
    await clientstart(phoneNumber, code)
  })()
}
