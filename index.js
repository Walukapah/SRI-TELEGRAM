const express = require('express'); const { Telegraf } = require('telegraf'); const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys'); const fs = require('fs'); const path = require('path'); const P = require('pino');

const config = require('./config'); const prefix = config.PREFIX; const TELEGRAM_TOKEN = config.TELEGRAM_TOKEN || "7355024353:AAFcH-OAF5l5Fj6-igY4jOtqZ7HtZGRrlYQ"; const PORT = process.env.PORT || 3000;

const app = express(); app.use(express.json()); const bot = new Telegraf(TELEGRAM_TOKEN); const activeSessions = new Map();

app.use(express.static('public'));

app.get('/api/status', (req, res) => { res.json({ status: 'active', services: { whatsapp: activeSessions.size > 0 ? 'connected' : 'disconnected', telegram: 'active' } }); });

bot.command('pair', async (ctx) => { const args = ctx.message.text.split(' '); if (args.length !== 2) { return ctx.reply('❌ නිවැරදි භාවිතය:\n/pair 94xxxxxxxxx'); }

const phoneNumber = args[1].trim();
if (!/^94\d{9}$/.test(phoneNumber)) {
    return ctx.reply('❌ අවලංගු අංකයක්! 94 පටන් ගන්නා අංකයක් ඇතුලත් කරන්න (උදා: 94711234567)');
}

ctx.reply('⏳ Pairing සකස් වෙමින් පවතිනවා...');

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

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log(`${phoneNumber} Connected Successfully`);
            activeSessions.set(phoneNumber, sock);
        }
        if (connection === 'close') {
            console.log(`${phoneNumber} connection closed`);
            activeSessions.delete(phoneNumber);
        }
    });

    sock.ev.on('creds.update', saveCreds);

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

    sock.waitForConnectionUpdate = (status) => {
        return new Promise((resolve) => {
            sock.ev.on('connection.update', (update) => {
                if (update.connection === status) {
                    resolve();
                }
            });
        });
    };

    await sock.waitForConnectionUpdate('open');

    const code = await sock.requestPairingCode(phoneNumber);

    await ctx.replyWithHTML(
        `✅ <b>ඔබගේ WhatsApp Pairing කේතය:</b> <code>${code}</code>\n\n` +
        '1. WhatsApp විවෘත කරන්න\n' +
        '2. Settings → Linked Devices\n' +
        '3. "Link a Device" ඔබන්න\n' +
        '4. මෙම කේතය ඇතුලත් කරන්න\n\n' +
        '⏳ මෙම කේතය විනාඩි 10 ක් වලංගු වේ.'
    );

} catch (err) {
    console.error('Pairing error:', err);
    ctx.reply('❌ Pairing Code ලබා ගැනීමේදී දෝෂයක්. නැවත උත්සාහ කරන්න.');
}

});

app.listen(PORT, () => { console.log(Server running on port ${PORT}); bot.launch().then(() => { console.log('Telegram bot started'); }); });

process.once('SIGINT', () => { activeSessions.forEach(sock => sock.end()); bot.stop('SIGINT'); process.exit(0); });

process.once('SIGTERM', () => { activeSessions.forEach(sock => sock.end()); bot.stop('SIGTERM'); process.exit(0); });

