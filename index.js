const express = require('express');
const { Telegraf } = require('telegraf');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');

// Configurations
const config = require('./config');
const prefix = config.PREFIX;
const ownerNumber = config.OWNER_NUMBER;
const TELEGRAM_TOKEN = config.TELEGRAM_TOKEN || "7355024353:AAFcH-OAF5l5Fj6-igY4jOtqZ7HtZGRrlYQ";
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Telegram Bot
const bot = new Telegraf(TELEGRAM_TOKEN);
const pairingSessions = new Map();

// WhatsApp Client
let whatsappClient = null;
let waSocket = null;

// Serve static files
app.use(express.static('public'));

// API endpoint to check bot status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'active',
        services: {
            whatsapp: waSocket ? 'connected' : 'disconnected',
            telegram: 'active'
        }
    });
});

// Telegram Pairing Command
bot.command('pair', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        await ctx.reply('🔢 WhatsApp අංකය ඇතුලත් කරන්න (94xxxxxxxx):');
        
        bot.on('text', async (msgCtx) => {
            if (msgCtx.from.id === userId) {
                const phoneNumber = msgCtx.message.text.trim();
                
                if (!/^94\d{9}$/.test(phoneNumber)) {
                    return msgCtx.reply('❌ අවලංගු අංකයක්! 94 පටන් ගන්නා අංකයක් ඇතුලත් කරන්න (උදා: 94711234567)');
                }
                
                whatsappClient = makeWASocket({
                    printQRInTerminal: false,
                    auth: { creds: {}, keys: {} }
                });
                
                try {
                    const code = await whatsappClient.requestPairingCode(phoneNumber);
                    
                    pairingSessions.set(userId, {
                        phoneNumber,
                        client: whatsappClient,
                        timestamp: Date.now()
                    });
                    
                    await msgCtx.replyWithHTML(
                        `✅ <b>ඔබගේ WhatsApp පේරින් කේතය:</b> <code>${code}</code>\n\n` +
                        '1. WhatsApp විවෘත කරන්න\n' +
                        '2. Settings → Linked Devices වෙත යන්න\n' +
                        '3. "Link a Device" ඔබන්න\n' +
                        '4. මෙම කේතය ඇතුලත් කරන්න\n\n' +
                        '⏳ මෙම කේතය විනාඩි 10 ක් පමණ වලංගු වේ.'
                    );
                    
                    setTimeout(() => {
                        if (pairingSessions.has(userId)) {
                            whatsappClient.end();
                            pairingSessions.delete(userId);
                        }
                    }, 600000);
                    
                } catch (error) {
                    console.error('Pairing error:', error);
                    msgCtx.reply('❌ කේතය ජනනය කිරීමේ දෝෂයක්. කරුණාකර පසුව උත්සාහ කරන්න.');
                    if (whatsappClient) whatsappClient.end();
                }
            }
        });
    } catch (error) {
        console.error('Command error:', error);
        ctx.reply('❌ දෝෂයක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.');
    }
});

// WhatsApp Connection
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));
    const { version } = await fetchLatestBaileysVersion();

    waSocket = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.macOS('Safari'),
        version
    });

    waSocket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connected successfully');
        }
    });

    waSocket.ev.on('creds.update', saveCreds);

    // Message handling
    waSocket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message.message) return;

        const type = Object.keys(message.message)[0];
        const from = message.key.remoteJid;
        const body = type === 'conversation' ? message.message.conversation : 
                     type === 'extendedTextMessage' ? message.message.extendedTextMessage.text : '';

        if (body.startsWith(prefix)) {
            const command = body.slice(prefix.length).trim().split(' ')[0].toLowerCase();
            
            if (command === 'ping') {
                await waSocket.sendMessage(from, { text: 'Pong! 🏓' });
            }
        }
    });
}

// Start Express server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start Telegram bot
    bot.launch().then(() => {
        console.log('Telegram bot started');
    });
    
    // Start WhatsApp connection
    connectToWhatsApp().catch(err => {
        console.error('WhatsApp connection error:', err);
    });
});

// Cleanup
process.once('SIGINT', () => {
    pairingSessions.forEach(session => session.client.end());
    bot.stop('SIGINT');
    if (waSocket) waSocket.end();
    process.exit(0);
});

process.once('SIGTERM', () => {
    pairingSessions.forEach(session => session.client.end());
    bot.stop('SIGTERM');
    if (waSocket) waSocket.end();
    process.exit(0);
});
