const express = require('express');
const { Telegraf } = require('telegraf');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');

// Configurations
const config = require('./config');
const prefix = config.PREFIX || '!';
const TELEGRAM_TOKEN = config.TELEGRAM_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN";
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Telegram Bot
const bot = new Telegraf(TELEGRAM_TOKEN);

// Global WhatsApp Socket Map
const activeSessions = new Map();

// Serve static files if needed
app.use(express.static('public'));

// API endpoint to check bot status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'active',
        services: {
            telegram: 'active',
            whatsapp_sessions: Array.from(activeSessions.keys())
        }
    });
});

// /pair Command with phone number argument
bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        return ctx.reply('❌ නිවැරදි භාවිතය:\n/pair 94xxxxxxxxx');
    }

    const phoneNumber = args[1].trim();
    if (!/^94\d{9}$/.test(phoneNumber)) {
        return ctx.reply('❌ අවලංගු අංකයක්! 94 පටන් ගන්නා අංකයක් ඇතුලත් කරන්න (උදා: 94711234567)');
    }

    ctx.reply('⏳ Pairing Code ලබා ගන්නා අතරතුර, කරුණාකර රැදී සිටින්න...');

    try {
        const sessionFolder = path.join(__dirname, 'sessions', phoneNumber);
        fs.mkdirSync(sessionFolder, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

        const sock = makeWASocket({
            printQRInTerminal: false,
            auth: state,
            logger: P({ level: 'silent' }),
            browser: Browsers.macOS('Safari')
        });

        const code = await sock.requestPairingCode(phoneNumber);

        await ctx.replyWithHTML(
            `✅ <b>ඔබගේ WhatsApp Pairing කේතය:</b> <code>${code}</code>\n\n` +
            '1. WhatsApp විවෘත කරන්න\n' +
            '2. Settings → Linked Devices වෙත යන්න\n' +
            '3. "Link a Device" ඔබන්න\n' +
            '4. මෙම කේතය ඇතුලත් කරන්න\n\n' +
            '⏳ මෙම කේතය විනාඩි 10 ක් පමණ වලංගු වේ.'
        );

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log(`Reconnecting ${phoneNumber}...`);
                    startWhatsApp(phoneNumber);
                } else {
                    console.log(`${phoneNumber} logged out.`);
                    activeSessions.delete(phoneNumber);
                }
            } else if (connection === 'open') {
                console.log(`${phoneNumber} connected successfully.`);
                activeSessions.set(phoneNumber, sock);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const message = messages[0];
            if (!message.message) return;

            const type = Object.keys(message.message)[0];
            const from = message.key.remoteJid;
            const body = type === 'conversation' ? message.message.conversation :
                         type === 'extendedTextMessage' ? message.message.extendedTextMessage.text : '';

            if (body.startsWith(prefix)) {
                const command = body.slice(prefix.length).trim().split(' ')[0].toLowerCase();
                
                if (command === 'ping') {
                    await sock.sendMessage(from, { text: 'Pong! 🏓' });
                }
            }
        });

        // 10 minutes later, disconnect socket if still pairing
        setTimeout(() => {
            if (!activeSessions.has(phoneNumber)) {
                sock.end();
                console.log(`Temporary session for ${phoneNumber} closed.`);
            }
        }, 10 * 60 * 1000);

    } catch (error) {
        console.error('Pairing error:', error);
        ctx.reply('❌ කේතය ලබා ගැනීමේ දෝෂයක්. කරුණාකර පසුව උත්සාහ කරන්න.');
    }
});

// Start WhatsApp permanently for session
async function startWhatsApp(phoneNumber) {
    const sessionFolder = path.join(__dirname, 'sessions', phoneNumber);
    if (!fs.existsSync(sessionFolder)) return;

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: P({ level: 'silent' }),
        browser: Browsers.macOS('Safari')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                console.log(`Reconnecting ${phoneNumber}...`);
                startWhatsApp(phoneNumber);
            } else {
                console.log(`${phoneNumber} logged out.`);
                activeSessions.delete(phoneNumber);
            }
        } else if (connection === 'open') {
            console.log(`${phoneNumber} connected successfully.`);
            activeSessions.set(phoneNumber, sock);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message.message) return;

        const type = Object.keys(message.message)[0];
        const from = message.key.remoteJid;
        const body = type === 'conversation' ? message.message.conversation :
                     type === 'extendedTextMessage' ? message.message.extendedTextMessage.text : '';

        if (body.startsWith(prefix)) {
            const command = body.slice(prefix.length).trim().split(' ')[0].toLowerCase();
            
            if (command === 'ping') {
                await sock.sendMessage(from, { text: 'Pong! 🏓' });
            }
        }
    });
}

// Start Express server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start Telegram bot
    bot.launch().then(() => {
        console.log('Telegram bot started successfully');
    });

    // Reload existing sessions on startup
    const sessionsDir = path.join(__dirname, 'sessions');
    if (fs.existsSync(sessionsDir)) {
        fs.readdirSync(sessionsDir).forEach(folder => {
            startWhatsApp(folder);
        });
    }
});
