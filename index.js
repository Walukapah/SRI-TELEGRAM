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
const readline = require('readline')

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

    async createNewSession() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        const sessionId = await new Promise(resolve => {
            rl.question('Enter session name (default: "default"): ', answer => {
                resolve(answer.trim() || 'default')
            })
        })

        const phoneNumber = await new Promise(resolve => {
            rl.question('Enter WhatsApp number with country code (e.g. 94712345678): ', answer => {
                resolve(answer.trim())
            })
        })

        rl.close()

        const { state, saveCreds } = await this.getAuthState(sessionId)
        const conn = makeWASocket({
            logger: P({ level: 'silent' }),
            printQRInTerminal: true,
            browser: Browsers.macOS("Chrome"),
            auth: state
        })

        if (!conn.authState.creds.registered) {
            const code = await conn.requestPairingCode(phoneNumber)
            console.log(`\nPairing code for session "${sessionId}": ${code}\n`)
            
            await new Promise(resolve => {
                conn.ev.on('creds.update', saveCreds)
                conn.ev.on('connection.update', update => {
                    if (update.connection === 'open') {
                        console.log(`Session "${sessionId}" paired successfully!`)
                        resolve()
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

    async selectSession() {
        const sessions = this.listSessions()
        
        if (sessions.length === 0) {
            console.log('No existing sessions found.')
            return await this.createNewSession()
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        console.log('\nAvailable sessions:')
        sessions.forEach((session, index) => {
            console.log(`${index + 1}. ${session}`)
        })

        const choice = await new Promise(resolve => {
            rl.question('Select session (number) or "new" to create: ', answer => {
                resolve(answer.trim())
            })
        })

        rl.close()

        if (choice.toLowerCase() === 'new') {
            return await this.createNewSession()
        }

        const index = parseInt(choice) - 1
        if (isNaN(index) || index < 0 || index >= sessions.length) {
            console.log('Invalid selection, using default session')
            return 'default'
        }

        return sessions[index]
    }

    async loadConfigSession() {
        if (config.SESSION_ID) {
            if (config.SESSION_ID.startsWith('base64:')) {
                const sessionData = Buffer.from(config.SESSION_ID.replace('base64:', ''), 'base64').toString('utf-8')
                const sessionPath = path.join(this.sessionsDir, 'config_session')
                this.ensureSessionsDir()
                fs.writeFileSync(path.join(sessionPath, 'creds.json'), sessionData)
                return 'config_session'
            }
            return config.SESSION_ID
        }
        return null
    }
}

//=================== MAIN CONNECTION FUNCTION ============================
async function connectToWA() {
    const sessionManager = new SessionManager()
    
    // Load session from config or prompt user
    let sessionId = await sessionManager.loadConfigSession() || await sessionManager.selectSession()
    
    console.log(`Initializing session: ${sessionId}...`)
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

    // Message processing handler (your existing implementation)
    conn.ev.on('messages.upsert', async (mek) => {
        try {
            mek = mek.messages[0]
            if (!mek.message) return
            mek.message = (getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message

            // Your existing message processing logic here...
            // (Keep all your current message handling, commands, etc.)
            
            const m = sms(conn, mek)
            const type = getContentType(mek.message)
            const from = mek.key.remoteJid
            const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage : null
            const body = (type === 'conversation') ? mek.message.conversation : 
                         (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : 
                         (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : 
                         (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
            
            // ... rest of your message handling code

        } catch (err) {
            console.error('Message processing error:', err)
        }
    })

    // Utility functions (your existing implementations)
    conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
        // ... your existing implementation
    }

    // Add other utility functions as needed...
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
