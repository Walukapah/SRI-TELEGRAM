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
        const from = mek.key.remoteJid
        const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
        const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
        const isCmd = body.startsWith(prefix)
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
        const args = body.trim().split(/ +/).slice(1)
        const isGroup = from.endsWith('@g.us')
        const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
        const senderNumber = sender.split('@')[0]
        const botNumber = conn.user.id.split(':')[0]
        const pushname = mek.pushName || 'Sin Nombre'
        const isOwner = ownerNumber.includes(senderNumber)

        // Your existing message handling logic here...
    })

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
