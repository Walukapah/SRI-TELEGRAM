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

// Telegram bot setup
const TELEGRAM_BOT_TOKEN = '7355024353:AAFcH-OAF5l5Fj6-igY4jOtqZ7HtZGRrlYQ';
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, {polling: true});
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

    async createNewSession(sessionId, phoneNumber, telegramUserId, customPair = null) {
        const { state, saveCreds } = await this.getAuthState(sessionId)
        const { version } = await fetchLatestBaileysVersion()
        
        const conn = makeWASocket({
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Chrome"),
            auth: state,
            version
        })

        if (!conn.authState.creds.registered) {
            let code;
            let pairingMessage;
            
            if (customPair) {
                // Custom pairing
                code = await conn.requestPairingCode(phoneNumber, customPair);
                pairingMessage = `🔐 *Custom Pairing Code for ${phoneNumber}*:\n\n` +
                                `Pairing Code: \`${code}\`\n` +
                                `Custom Pair: \`${customPair}\`\n\n` +
                                `This code will expire in 30 seconds.`;
            } else {
                // Normal pairing
                code = await conn.requestPairingCode(phoneNumber);
                pairingMessage = `🔐 *Pairing Code for ${phoneNumber}*:\n\n` +
                              `\`${code}\`\n\n` +
                              `This code will expire in 30 seconds.`;
            }
            
            // Send pairing code to Telegram user
            await telegramBot.sendMessage(
                telegramUserId, 
                pairingMessage,
                { parse_mode: 'Markdown' }
            )
            
            // Store the active pairing request
            activePairingRequests.set(telegramUserId, {
                sessionId,
                phoneNumber,
                conn,
                saveCreds,
                timestamp: Date.now(),
                isCustomPairing: !!customPair,
                customPair
            })
            
            // Set timeout to clear the request after 30 seconds
            setTimeout(() => {
                if (activePairingRequests.has(telegramUserId)) {
                    activePairingRequests.delete(telegramUserId)
                    telegramBot.sendMessage(
                        telegramUserId, 
                        `⏳ Pairing code for ${phoneNumber} has expired. Please try again.`
                    )
                }
            }, 30000)
            
            return new Promise((resolve, reject) => {
                conn.ev.on('creds.update', saveCreds)
                conn.ev.on('connection.update', update => {
                    if (update.connection === 'open') {
                        activePairingRequests.delete(telegramUserId)
                        const successMessage = customPair ?
                            `✅ Session "${sessionId}" paired successfully with ${phoneNumber} using custom pairing!` :
                            `✅ Session "${sessionId}" paired successfully with ${phoneNumber}!`;
                        
                        telegramBot.sendMessage(telegramUserId, successMessage)
                        resolve(sessionId)
                    }
                })
            })
        }

        return sessionId
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

// Helper function to generate custom 8-character alphanumeric pair code
function generateCustomPairCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Initialize session manager
const sessionManager = new SessionManager()

// Telegram bot commands
telegramBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    telegramBot.sendMessage(
        chatId,
        `👋 *WhatsApp Bot Pairing System*\n\n` +
        `Available commands:\n` +
        `/pair [number] - Normal pairing (e.g., /pair 94712345678)\n` +
        `/pair [number] [code] - Custom pairing (e.g., /pair 94712345678 AB123C4D)\n` +
        `/mysession - View your active session\n` +
        `/deletesession - Delete your current session`,
        { parse_mode: 'Markdown' }
    );
});

telegramBot.onText(/\/pair (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const input = match[1].trim();
    
    // Parse input (could be just number or number + custom pair)
    let phoneNumber, customPair;
    if (input.includes(' ')) {
        const parts = input.split(' ');
        phoneNumber = parts[0];
        customPair = parts[1];
    } else {
        phoneNumber = input;
    }
    
    // Validate phone number
    if (!/^\d+$/.test(phoneNumber)) {
        return telegramBot.sendMessage(chatId, '❌ Invalid phone number. Please provide only digits (e.g., /pair 94712345678)');
    }
    
    // Validate custom pair if provided
    if (customPair && !/^[A-Z0-9]{8}$/.test(customPair)) {
        return telegramBot.sendMessage(chatId, '❌ Custom pair must be exactly 8 alphanumeric characters (e.g., AB123C4D)');
    }
    
    // Check if user already has an active pairing request
    if (activePairingRequests.has(chatId)) {
        return telegramBot.sendMessage(chatId, '❌ You already have an active pairing request. Please wait for it to complete or expire.');
    }
    
    // Check if user already has a session
    const existingSession = await sessionManager.getSessionByUser(chatId);
    if (existingSession) {
        return telegramBot.sendMessage(
            chatId,
            `⚠️ You already have an active session: ${existingSession}\n\n` +
            `Use /deletesession first if you want to pair a new number.`
        );
    }
    
    // Create new session
    const sessionId = `user_${chatId}_${Date.now()}`;
    
    try {
        telegramBot.sendMessage(chatId, `⏳ Generating pairing code for ${phoneNumber}...`);
        await sessionManager.createNewSession(sessionId, phoneNumber, chatId, customPair);
    } catch (error) {
        console.error('Pairing error:', error);
        telegramBot.sendMessage(chatId, '❌ Failed to create pairing session. Please try again.');
    }
});

telegramBot.onText(/\/mysession/, async (msg) => {
    const chatId = msg.chat.id;
    const session = await sessionManager.getSessionByUser(chatId);
    
    if (session) {
        telegramBot.sendMessage(
            chatId,
            `🔍 *Your Active Session*\n\n` +
            `Session ID: \`${session}\`\n` +
            `Created: ${new Date(parseInt(session.split('_')[2])).toLocaleString()}\n\n` +
            `Use /deletesession to remove this pairing.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        telegramBot.sendMessage(
            chatId,
            `❌ You don't have an active WhatsApp session.\n\n` +
            `Use /pair [number] to create one.`
        );
    }
});

telegramBot.onText(/\/deletesession/, async (msg) => {
    const chatId = msg.chat.id;
    const session = await sessionManager.getSessionByUser(chatId);
    
    if (session) {
        const deleted = await sessionManager.deleteSession(session);
        if (deleted) {
            telegramBot.sendMessage(
                chatId,
                `✅ Successfully deleted session: ${session}\n\n` +
                `You can now pair a new number with /pair [number]`
            );
        } else {
            telegramBot.sendMessage(chatId, '❌ Failed to delete session. Please try again.');
        }
    } else {
        telegramBot.sendMessage(chatId, '❌ You don\'t have an active session to delete.');
    }
});

//=================== MAIN CONNECTION FUNCTION ============================
async function connectToWA() {
    // Check if we should use a specific session from config
    if (config.SESSION_ID) {
        console.log(`Initializing configured session: ${config.SESSION_ID}...`);
        return await initializeWhatsAppConnection(config.SESSION_ID);
    }
    
    // Otherwise, look for any existing sessions
    const sessions = sessionManager.listSessions();
    if (sessions.length > 0) {
        // For this implementation, we'll just use the first session found
        // In a real multi-user system, you'd need a way to determine which session to use
        console.log(`Initializing existing session: ${sessions[0]}...`);
        return await initializeWhatsAppConnection(sessions[0]);
    }
    
    console.log('No WhatsApp sessions found. Waiting for pairing via Telegram...');
}

async function initializeWhatsAppConnection(sessionId) {
    const { state, saveCreds } = await sessionManager.getAuthState(sessionId)

    const { version } = await fetchLatestBaileysVersion()
    const conn = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        syncFullHistory: true,
        auth: state,
        version
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
        mek = mek.messages[0];
        if (!mek.message) return;
        mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;

        const reset = "\x1b[0m";
        const red = "\x1b[31m";
        const green = "\x1b[32m";
        const blue = "\x1b[34m";
        const cyan = "\x1b[36m";
        const bold = "\x1b[1m";
        
        // Auto mark as seen
        if (config.MARK_AS_SEEN === 'true') {
            try {
                await conn.sendReadReceipt(mek.key.remoteJid, mek.key.id, [mek.key.participant || mek.key.remoteJid]);
                console.log(green + `Marked message from ${mek.key.remoteJid} as seen.` + reset);
            } catch (error) {
                console.error(red + "Error marking message as seen:", error + reset);
            }
        }

        // Auto read messages
        if (config.READ_MESSAGE === 'true') {
            try {
                await conn.readMessages([mek.key]);
                console.log(green + `Marked message from ${mek.key.remoteJid} as read.` + reset);
            } catch (error) {
                console.error(red + "Error marking message as read:", error + reset);
            }
        }

        // Status updates handling
        if (mek.key && mek.key.remoteJid === 'status@broadcast') {
            // Auto read Status
            if (config.AUTO_READ_STATUS === "true") {
                try {
                    await conn.readMessages([mek.key]);
                    console.log(green + `Status from ${mek.key.participant || mek.key.remoteJid} marked as read.` + reset);
                } catch (error) {
                    console.error(red + "Error reading status:", error + reset);
                }
            }

            // Auto react to Status
            if (config.AUTO_REACT_STATUS === "true") {
                try {
                    await conn.sendMessage(
                        mek.key.participant || mek.key.remoteJid,
                        { react: { text: config.AUTO_REACT_STATUS_EMOJI, key: mek.key } }
                    );
                    console.log(green + `Reacted to status from ${mek.key.participant || mek.key.remoteJid}` + reset);
                } catch (error) {
                    console.error(red + "Error reacting to status:", error + reset);
                }
            }

            return;
        }

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
            }
        });
    })
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
    connectToWA().catch(err => {
        console.error('Initialization error:', err)
        process.exit(1)
    })
}, 4000)
