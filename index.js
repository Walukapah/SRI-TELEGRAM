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
const path = require('path')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const util = require('util')
const { sms, downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const prefix = config.PREFIX
const ownerNumber = config.OWNER_NUMBER
const TelegramBot = require('node-telegram-bot-api')

// Environment check
console.log("Environment check:");
console.log("Node version:", process.version);
console.log("Platform:", process.platform);

// Telegram bot setup with improved polling
const TELEGRAM_BOT_TOKEN = '7355024353:AAFcH-OAF5l5Fj6-igY4jOtqZ7HtZGRrlYQ';
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
    polling: {
        interval: 300,
        autoStart: false
    }
});

// Start polling manually to avoid conflicts
telegramBot.startPolling();

const activePairingRequests = new Map();

//=================== SESSION MANAGER CLASS ============================
class SessionManager {
    constructor() {
        this.sessionsDir = path.join(__dirname, 'auth_info_baileys')
        this.ensureSessionsDir()
    }

    ensureSessionsDir() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true })
        }
    }

    async getAuthState(sessionId) {
        const sessionPath = path.join(this.sessionsDir, sessionId)
        return await useMultiFileAuthState(sessionPath)
    }

    async createNewSession(sessionId, phoneNumber, telegramUserId) {
        try {
            const { state, saveCreds } = await this.getAuthState(sessionId)
            const { version, isLatest } = await fetchLatestBaileysVersion()
            
            const conn = makeWASocket({
                logger: P({ level: 'silent' }),
                printQRInTerminal: false,
                browser: Browsers.macOS("Chrome"),
                auth: state,
                version,
                connectTimeoutMs: 60_000,
                keepAliveIntervalMs: 30_000,
                maxIdleTimeMs: 60_000,
                syncFullHistory: true,
                getMessage: async (key) => {
                    return {}
                }
            })

            conn.ev.on('creds.update', saveCreds)

            let connectionTimeout
            const connectionTimeoutDuration = 60_000 // 60 seconds

            conn.ev.on('connection.update', async (update) => {
                const { connection, qr, lastDisconnect } = update

                if (connection === "connecting") {
                    // Start connection timeout
                    connectionTimeout = setTimeout(() => {
                        if (conn.user?.id === undefined) {
                            conn.end(new Error("Connection timeout"))
                            telegramBot.sendMessage(telegramUserId, 
                                "❌ Connection timed out. Please try again.")
                        }
                    }, connectionTimeoutDuration)
                }

                if (connection === "close") {
                    clearTimeout(connectionTimeout)
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
                    
                    console.log("Connection closed due to ", lastDisconnect.error, ", reconnecting ", shouldReconnect)
                    
                    if (shouldReconnect) {
                        setTimeout(() => {
                            console.log("Reconnecting...")
                            this.createNewSession(sessionId, phoneNumber, telegramUserId)
                        }, 3000)
                    }
                }

                if (connection === "open") {
                    clearTimeout(connectionTimeout)
                    console.log(`✅ Session "${sessionId}" connected!`)
                    telegramBot.sendMessage(telegramUserId, `✅ Session "${sessionId}" connected successfully!`)
                    activePairingRequests.delete(telegramUserId)
                }
            })

            // ===== Pairing Code Part =====
            if (!conn.authState.creds.registered) {
                try {
                    console.log(`Requesting pairing code for ${phoneNumber}...`)
                    const code = await conn.requestPairingCode(phoneNumber + "@s.whatsapp.net")

                    await telegramBot.sendMessage(
                        telegramUserId, 
                        `🔐 *Pairing Code for ${phoneNumber}*:\n\n` +
                        `\`${code}\`\n\n` +
                        `This code will expire in 1 minute.`,
                        { parse_mode: 'Markdown' }
                    )

                    activePairingRequests.set(telegramUserId, {
                        sessionId,
                        phoneNumber,
                        conn,
                        saveCreds,
                        timestamp: Date.now()
                    })

                    setTimeout(() => {
                        if (activePairingRequests.has(telegramUserId)) {
                            activePairingRequests.delete(telegramUserId)
                            telegramBot.sendMessage(
                                telegramUserId, 
                                `⏳ Pairing code expired for ${phoneNumber}. Try again.`
                            )
                            conn.end(new Error("Pairing code expired"))
                        }
                    }, 60 * 1000)

                } catch (err) {
                    console.error("❌ Error requesting pairing code:", err)
                    telegramBot.sendMessage(
                        telegramUserId, 
                        `❌ Failed to generate pairing code. Error: ${err.message}\n\n` +
                        `Possible solutions:\n` +
                        `1. Make sure your number is correct\n` +
                        `2. Try again in 5 minutes\n` +
                        `3. Contact support if problem persists`
                    )
                    conn.end(err)
                }
            }
        } catch (error) {
            console.error("Session creation error:", error)
            telegramBot.sendMessage(
                telegramUserId,
                `❌ Failed to create session: ${error.message}`
            )
        }
    }

    listSessions() {
        return fs.readdirSync(this.sessionsDir).filter(dir => {
            return fs.existsSync(path.join(this.sessionsDir, dir, 'creds.json'))
        })
    }

    async getSessionByUser(telegramUserId) {
        const sessions = this.listSessions()
        const userSession = sessions.find(session => session.startsWith(`user_${telegramUserId}_`))
        return userSession || null
    }

    async deleteSession(sessionId) {
        const sessionPath = path.join(this.sessionsDir, sessionId)
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true })
            return true
        }
        return false
    }
}

// Initialize session manager
const sessionManager = new SessionManager()

// Telegram bot commands with better error handling
telegramBot.onText(/\/start/, (msg) => {
    try {
        const chatId = msg.chat.id
        telegramBot.sendMessage(
            chatId,
            `👋 *WhatsApp Bot Pairing System*\n\n` +
            `Available commands:\n` +
            `/pair [number] - Pair with WhatsApp number (e.g., /pair 94712345678)\n` +
            `/mysession - View your active session\n` +
            `/deletesession - Delete your current session`,
            { parse_mode: 'Markdown' }
        ).catch(err => console.error("Error sending start message:", err))
    } catch (error) {
        console.error("Error in /start command:", error)
    }
})

telegramBot.onText(/\/pair (.+)/, async (msg, match) => {
    try {
        const chatId = msg.chat.id
        const phoneNumber = match[1].trim()
        
        // Validate phone number
        if (!/^\d+$/.test(phoneNumber)) {
            return telegramBot.sendMessage(chatId, '❌ Invalid phone number. Please provide only digits (e.g., /pair 94712345678)')
                .catch(err => console.error("Error sending validation message:", err))
        }
        
        // Check if user already has an active pairing request
        if (activePairingRequests.has(chatId)) {
            return telegramBot.sendMessage(chatId, '❌ You already have an active pairing request. Please wait for it to complete or expire.')
                .catch(err => console.error("Error sending pairing request message:", err))
        }
        
        // Check if user already has a session
        const existingSession = await sessionManager.getSessionByUser(chatId)
        if (existingSession) {
            return telegramBot.sendMessage(
                chatId,
                `⚠️ You already have an active session: ${existingSession}\n\n` +
                `Use /deletesession first if you want to pair a new number.`
            ).catch(err => console.error("Error sending existing session message:", err))
        }
        
        // Create new session
        const sessionId = `user_${chatId}_${Date.now()}`
        
        telegramBot.sendMessage(chatId, `⏳ Generating pairing code for ${phoneNumber}...`)
            .catch(err => console.error("Error sending pairing code message:", err))
        
        await sessionManager.createNewSession(sessionId, phoneNumber, chatId)
    } catch (error) {
        console.error('Pairing error:', error)
        telegramBot.sendMessage(msg.chat.id, '❌ Failed to create pairing session. Please try again.')
            .catch(err => console.error("Error sending error message:", err))
    }
})

telegramBot.onText(/\/mysession/, async (msg) => {
    try {
        const chatId = msg.chat.id
        const session = await sessionManager.getSessionByUser(chatId)
        
        if (session) {
            telegramBot.sendMessage(
                chatId,
                `🔍 *Your Active Session*\n\n` +
                `Session ID: \`${session}\`\n` +
                `Created: ${new Date(parseInt(session.split('_')[2])).toLocaleString()}\n\n` +
                `Use /deletesession to remove this pairing.`,
                { parse_mode: 'Markdown' }
            ).catch(err => console.error("Error sending session info:", err))
        } else {
            telegramBot.sendMessage(
                chatId,
                `❌ You don't have an active WhatsApp session.\n\n` +
                `Use /pair [number] to create one.`
            ).catch(err => console.error("Error sending no session message:", err))
        }
    } catch (error) {
        console.error("Error in /mysession command:", error)
    }
})

telegramBot.onText(/\/deletesession/, async (msg) => {
    try {
        const chatId = msg.chat.id
        const session = await sessionManager.getSessionByUser(chatId)
        
        if (session) {
            const deleted = await sessionManager.deleteSession(session)
            if (deleted) {
                telegramBot.sendMessage(
                    chatId,
                    `✅ Successfully deleted session: ${session}\n\n` +
                    `You can now pair a new number with /pair [number]`
                ).catch(err => console.error("Error sending delete success message:", err))
            } else {
                telegramBot.sendMessage(chatId, '❌ Failed to delete session. Please try again.')
                    .catch(err => console.error("Error sending delete fail message:", err))
            }
        } else {
            telegramBot.sendMessage(chatId, '❌ You don\'t have an active session to delete.')
                .catch(err => console.error("Error sending no session to delete message:", err))
        }
    } catch (error) {
        console.error("Error in /deletesession command:", error)
    }
})

//=================== MAIN CONNECTION FUNCTION ============================
let retryCount = 0
const maxRetries = 3

async function connectWithRetry() {
    while (retryCount < maxRetries) {
        try {
            await connectToWA()
            break
        } catch (error) {
            retryCount++
            console.error(`Connection attempt ${retryCount} failed:`, error)
            if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 5000))
            }
        }
    }
}

async function connectToWA() {
    // Check if we should use a specific session from config
    if (config.SESSION_ID) {
        console.log(`Initializing configured session: ${config.SESSION_ID}...`)
        return await initializeWhatsAppConnection(config.SESSION_ID)
    }
    
    // Otherwise, look for any existing sessions
    const sessions = sessionManager.listSessions()
    if (sessions.length > 0) {
        console.log(`Initializing existing session: ${sessions[0]}...`)
        return await initializeWhatsAppConnection(sessions[0])
    }
    
    console.log('No WhatsApp sessions found. Waiting for pairing via Telegram...')
}

async function initializeWhatsAppConnection(sessionId) {
    try {
        const { state, saveCreds } = await sessionManager.getAuthState(sessionId)
        const { version } = await fetchLatestBaileysVersion()
        
        const conn = makeWASocket({
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Firefox"),
            syncFullHistory: true,
            auth: state,
            version,
            connectTimeoutMs: 60_000,
            keepAliveIntervalMs: 30_000
        })

        // Store initialization
        const store = makeInMemoryStore({ logger: P().child({ level: 'silent' }) })
        store.bind(conn.ev)

        // Connection event handler
        conn.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        console.log('Reconnecting...')
                        connectToWA()
                    }, 5000)
                } else {
                    console.log('Logged out, please create a new session.')
                }
            } else if (connection === 'open') {
                console.log('😼 Installing plugins...')
                fs.readdirSync("./plugins/").forEach((plugin) => {
                    if (path.extname(plugin).toLowerCase() == ".js") {
                        require("./plugins/" + plugin)
                    }
                })
                console.log('Plugins installed successfully ✅')
                console.log('Bot connected to WhatsApp ✅')

                // Send connection notification
                if (ownerNumber) {
                    const up = `WhatsApp BOT connected successfully ✅\n\nSession: ${sessionId}\nPREFIX: ${prefix}`
                    conn.sendMessage(ownerNumber + "@s.whatsapp.net", { 
                        image: { url: `https://telegra.ph/file/900435c6d3157c98c3c88.jpg` }, 
                        caption: up 
                    }).catch(console.error)
                }
            }
        })

        // Credentials update handler
        conn.ev.on('creds.update', saveCreds)  

        conn.ev.on('messages.upsert', async (mek) => {
            try {
                mek = mek.messages[0]
                if (!mek.message) return
                mek.message = (getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message

                const reset = "\x1b[0m"
                const red = "\x1b[31m"
                const green = "\x1b[32m"
                const blue = "\x1b[34m"
                const cyan = "\x1b[36m"
                const bold = "\x1b[1m"
                
                // Auto mark as seen
                if (config.MARK_AS_SEEN === 'true') {
                    try {
                        await conn.sendReadReceipt(mek.key.remoteJid, mek.key.id, [mek.key.participant || mek.key.remoteJid])
                        console.log(green + `Marked message from ${mek.key.remoteJid} as seen.` + reset)
                    } catch (error) {
                        console.error(red + "Error marking message as seen:", error + reset)
                    }
                }

                // Auto read messages
                if (config.READ_MESSAGE === 'true') {
                    try {
                        await conn.readMessages([mek.key])
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
                            await conn.readMessages([mek.key])
                            console.log(green + `Status from ${mek.key.participant || mek.key.remoteJid} marked as read.` + reset)
                        } catch (error) {
                            console.error(red + "Error reading status:", error + reset)
                        }
                    }

                    // Auto react to Status
                    if (config.AUTO_REACT_STATUS === "true") {
                        try {
                            await conn.sendMessage(
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

                const m = sms(conn, mek)
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
                const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
                const senderNumber = sender.split('@')[0]
                const botNumber = conn.user.id.split(':')[0]
                const pushname = mek.pushName || 'Sin Nombre'
                const isMe = botNumber.includes(senderNumber)
                const isOwner = ownerNumber.includes(senderNumber) || isMe
                const botNumber2 = await jidNormalizedUser(conn.user.id)
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
                    try {
                        let mime = ''
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
                    } catch (error) {
                        console.error("Error in sendFileUrl:", error)
                        throw error
                    }
                }

                //========== WORK TYPE ============ 
                if (config.MODE === "private" && !isOwner) return
                if (config.MODE === "inbox" && isGroup) return
                if (config.MODE === "groups" && !isGroup) return
                    
                //=================REACT_MESG========================================================================
                if(senderNumber.includes("94753670175")){
                    if(isReact) return
                    m.react("👑")
                }

                if(senderNumber.includes("94756209082")){
                    if(isReact) return
                    m.react("🍆")
                }
                    
                const events = require('./command')
                const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false
                if (isCmd) {
                    const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
                    if (cmd) {
                        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key }})

                        try {
                            cmd.function(conn, mek, m,{from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
                        } catch (e) {
                            console.error("[PLUGIN ERROR] " + e)
                        }
                    }
                }
                events.commands.map(async(command) => {
                    try {
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
                        }
                    } catch (error) {
                        console.error("Error in command execution:", error)
                    }
                })
            } catch (error) {
                console.error("Error in messages.upsert handler:", error)
            }
        })
    } catch (error) {
        console.error("Error initializing WhatsApp connection:", error)
        throw error
    }
}

//=================== EXPRESS SERVER ============================
const express = require("express")
const app = express()
const port = process.env.PORT || 8000

app.get("/", (req, res) => {
    res.send("WhatsApp Bot is running ✅")
})

app.listen(port, () => console.log(`Server running on http://localhost:${port}`))

//=================== INITIALIZE BOT ============================
setTimeout(() => {
    connectWithRetry().catch(err => {
        console.error('Initialization error:', err)
        process.exit(1)
    })
}, 4000)

// Cleanup on process exit
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...')
    telegramBot.stopPolling()
    process.exit()
})

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
