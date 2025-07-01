const express = require('express');
const { Telegraf } = require('telegraf');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');

// Configurations
const config = require('./config');
const prefix = config.PREFIX;
const ownerNumber = config.OWNER_NUMBER;
const TELEGRAM_TOKEN = config.TELEGRAM_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN";
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Telegram Bot
const bot = new Telegraf(TELEGRAM_TOKEN);

// WhatsApp Socket
let waSocket = null;

// Serve static files
app.use(express.static('public'));

// Status API
app.get('/api/status', (req, res) => {
    res.json({
        status: 'active',
        services: {
            whatsapp: waSocket ? 'connected' : 'disconnected',
            telegram: 'active'
        }
    });
});

// Telegram Pair Command
bot.command('pair', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        return ctx.reply('❌ නිවැරදි භාවිතය: /pair 94xxxxxxxxx');
    }

    const phoneNumber = args[1].trim();

    if (!/^94\d{9}$/.test(phoneNumber)) {
        return ctx.reply('❌ අවලංගු අංකයක්! 94 පටන් ගන්නා අංකයක් ඇතුලත් කරන්න (උදා: 94711234567)');
    }

    ctx.reply('⏳ Pairing Code ලබා ගන්නා අතරතුර...');

    try {
        const tempSock = makeWASocket({
            printQRInTerminal: false,
            auth: { creds: {}, keys: {} }
        });

        const code = await tempSock.requestPairingCode(phoneNumber);

        await ctx.replyWithHTML(
            `✅ <b>ඔබගේ WhatsApp Pairing කේතය:</b> <code>${code}</code>\n\n` +
            '1. WhatsApp විවෘත කරන්න\n' +
            '2. Settings → Linked Devices වෙත යන්න\n' +
            '3. "Link a Device" ඔබන්න\n' +
            '4. මෙම කේතය ඇතුලත් කරන්න\n\n' +
            '⏳ මෙම කේතය විනාඩි 10 ක් පමණ වලංගු වේ.'
        );

        // 10 minutesට පස්සේ Temp Socket අයින් වෙනවා
        setTimeout(() => {
            tempSock.end();
        }, 600000);

    } catch (err) {
        console.error('Pairing error:', err);
        ctx.reply('❌ කේතය ලබා ගැනීමේ දෝෂයක්. කරුණාකර පසුව උත්සාහ කරන්න.');
    }
});

// Connect to WhatsApp Permanently
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));
    const { version } = await fetchLatestBaileysVersion();

    waSocket = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false, // QR Terminal එකට එන්නේ නෑ
        auth: state,
        browser: Browsers.macOS('Safari'),
        version
    });

    waSocket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            console.log('WhatsApp disconnected');
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp connected successfully');
        }
    });

    waSocket.ev.on('creds.update', saveCreds);

    // Command Handling
    waSocket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const type = Object.keys(msg.message)[0];
        const from = msg.key.remoteJid;
        const body = type === 'conversation' ? msg.message.conversation :
                     type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';

        if (body.startsWith(prefix)) {
            const command = body.slice(prefix.length).trim().split(' ')[0].toLowerCase();

            if (command === 'ping') {
                await waSocket.sendMessage(from, { text: 'Pong! 🏓' });
            }
        }
    });
}

// Start Servers
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    bot.launch().then(() => console.log('🤖 Telegram Bot Started'));
});

// Start WhatsApp Connection After Pairing Completed
// ඔබට අවශ්‍ය නම්, Telegram Bot තුළ වෙනම Command එකක් දාලා WhatsApp Connect කරන්න පුළුවන්
// connectToWhatsApp(); <-- අවශ්‍ය විට මෙය අක්‍රීය කරන්න

// Cleanup
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    if (waSocket) waSocket.end();
    process.exit(0);
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    if (waSocket) waSocket.end();
    process.exit(0);
});
