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
const pino = require('pino')
const color = require('chalk')
const randomcolor = require('randomcolor')

// Question function with colored prompt
const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(color(text, randomcolor()), (answer) => {
            resolve(answer);
            rl.close();
        });
    });
}

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;

async function clientstart() {
    // Initialize store
    const store = makeInMemoryStore({
        logger: pino().child({ 
            level: 'silent',
            stream: 'store' 
        })
    });

    // Initialize auth state
    const { state, saveCreds } = await useMultiFileAuthState(`./${config().session || 'auth_info_baileys'}`)
    
    // Get latest version
    const { version } = await fetchLatestBaileysVersion();

    // Create client connection
    const client = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !config().status.terminal,
        auth: state,
        browser: Browsers.macOS("Firefox"),
        syncFullHistory: true,
        version
    });

    // Pairing code logic if not registered
    if (config().status.terminal && !client.authState.creds.registered) {
        const phoneNumber = await question('/> please enter your WhatsApp number, starting with 94:\n> number: ');
        const code = await client.requestPairingCode(phoneNumber);
        console.log(`your pairing code: ${code}`);
        console.log('Please enter this code in your WhatsApp app under Linked Devices');
    }

    // Bind store to client events
    store.bind(client.ev);
    
    // Save credentials when updated
    client.ev.on('creds.update', saveCreds);

    // Connection update handler
    client.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => {
                    console.log('Reconnecting after disconnect...');
                    clientstart();
                }, 5000);
            }
        } else if (connection === 'open') {
            console.log('😼 Installing... ');
            const path = require('path');
            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() == ".js") {
                    require("./plugins/" + plugin);
                }
            });
            console.log('Plugins installed successful ✅');
            console.log('Bot connected to whatsapp ✅');
            
            // Send startup message to owner
            if (ownerNumber) {
                const up = `Wa-BOT connected successful ✅\n\nPREFIX: ${prefix}`;
                client.sendMessage(ownerNumber + "@s.whatsapp.net", { 
                    text: up 
                }).catch(e => console.log('Failed to send startup message:', e));
            }
        }
    });

    // Message handler with all features
    client.ev.on('messages.upsert', async (mek) => {
        mek = mek.messages[0];
        if (!mek.message) return;
        mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;

        // Console colors
        const reset = "\x1b[0m";
        const red = "\x1b[31m";
        const green = "\x1b[32m";
        const blue = "\x1b[34m";
        const cyan = "\x1b[36m";
        const bold = "\x1b[1m";

        // Debug log
        console.log(red + "☰".repeat(32) + reset);
        console.log(green + bold + "New Message Detected:" + reset);
        console.log(cyan + JSON.stringify(mek, null, 2) + reset);
        console.log(red + "☰".repeat(32) + reset);

        // Auto mark as seen
        if (config.MARK_AS_SEEN === 'true') {
            try {
                await client.sendReadReceipt(mek.key.remoteJid, mek.key.id, [mek.key.participant || mek.key.remoteJid]);
                console.log(green + `Marked message from ${mek.key.remoteJid} as seen.` + reset);
            } catch (error) {
                console.error(red + "Error marking message as seen:", error + reset);
            }
        }

        // Auto read messages
        if (config.READ_MESSAGE === 'true') {
            try {
                await client.readMessages([mek.key]);
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
                    await client.readMessages([mek.key]);
                    console.log(green + `Status from ${mek.key.participant || mek.key.remoteJid} marked as read.` + reset);
                } catch (error) {
                    console.error(red + "Error reading status:", error + reset);
                }
            }

            // Auto react to Status
            if (config.AUTO_REACT_STATUS === "true") {
                try {
                    await client.sendMessage(
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

        const m = sms(client, mek);
        const type = getContentType(mek.message);
        const content = JSON.stringify(mek.message);
        const from = mek.key.remoteJid;
        const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : [];
        const body = (type === 'conversation') ? mek.message.conversation : 
                    (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : 
                    (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : 
                    (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : '';
        
        const isCmd = body.startsWith(prefix);
        const budy = typeof mek.text == 'string' ? mek.text : false;
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');
        const text = args.join(' ');
        const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us');
        const isGroup = isGroupJid(from);
        const sender = mek.key.fromMe ? (client.user.id.split(':')[0]+'@s.whatsapp.net' || client.user.id) : (mek.key.participant || mek.key.remoteJid);
        const senderNumber = sender.split('@')[0];
        const botNumber = client.user.id.split(':')[0];
        const pushname = mek.pushName || 'Sin Nombre';
        const isMe = botNumber.includes(senderNumber);
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const botNumber2 = await jidNormalizedUser(client.user.id);
        const groupMetadata = isGroup ? await client.groupMetadata(from).catch(e => {}) : '';
        const groupName = isGroup ? groupMetadata.subject : '';
        const participants = isGroup ? await groupMetadata.participants : '';
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
        const isReact = m.message.reactionMessage ? true : false;
        
        const reply = (teks) => {
            client.sendMessage(from, { text: teks }, { quoted: mek });
        }

        // File URL sender helper
        client.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
            let mime = '';
            let res = await axios.head(url);
            mime = res.headers['content-type'];
            if (mime.split("/")[1] === "gif") {
                return client.sendMessage(jid, { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options }, { quoted: quoted, ...options });
            }
            let type = mime.split("/")[0] + "Message";
            if (mime === "application/pdf") {
                return client.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption: caption, ...options }, { quoted: quoted, ...options });
            }
            if (mime.split("/")[0] === "image") {
                return client.sendMessage(jid, { image: await getBuffer(url), caption: caption, ...options }, { quoted: quoted, ...options });
            }
            if (mime.split("/")[0] === "video") {
                return client.sendMessage(jid, { video: await getBuffer(url), caption: caption, mimetype: 'video/mp4', ...options }, { quoted: quoted, ...options });
            }
            if (mime.split("/")[0] === "audio") {
                return client.sendMessage(jid, { audio: await getBuffer(url), caption: caption, mimetype: 'audio/mpeg', ...options }, { quoted: quoted, ...options });
            }
        };

        // Work mode restrictions
        if (config.MODE === "private" && !isOwner) return;
        if (config.MODE === "inbox" && isGroup) return;
        if (config.MODE === "groups" && !isGroup) return;

        // Special user reactions
        if (senderNumber.includes("94753670175")) {
            if (isReact) return;
            m.react("👑");
        }

        if (senderNumber.includes("94756209082")) {
            if (isReact) return;
            m.react("🍆");
        }

        // Command handling
        const events = require('./command');
        const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
        
        if (isCmd) {
            const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || 
                       events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName));
            
            if (cmd) {
                if (cmd.react) {
                    client.sendMessage(from, { react: { text: cmd.react, key: mek.key }});
                }

                try {
                    cmd.function(client, mek, m, {
                        from, quoted, body, isCmd, command, args, q, isGroup, 
                        sender, senderNumber, botNumber2, botNumber, pushname, 
                        isMe, isOwner, groupMetadata, groupName, participants, 
                        groupAdmins, isBotAdmins, isAdmins, reply
                    });
                } catch (e) {
                    console.error("[PLUGIN ERROR] " + e);
                }
            }
        }

        // Event-based commands
        events.commands.map(async (command) => {
            if (body && command.on === "body") {
                command.function(client, mek, m, {
                    from, l, quoted, body, isCmd, command, args, q, isGroup, 
                    sender, senderNumber, botNumber2, botNumber, pushname, 
                    isMe, isOwner, groupMetadata, groupName, participants, 
                    groupAdmins, isBotAdmins, isAdmins, reply
                });
            } else if (mek.q && command.on === "text") {
                command.function(client, mek, m, {
                    from, l, quoted, body, isCmd, command, args, q, isGroup, 
                    sender, senderNumber, botNumber2, botNumber, pushname, 
                    isMe, isOwner, groupMetadata, groupName, participants, 
                    groupAdmins, isBotAdmins, isAdmins, reply
                });
            } else if (
                (command.on === "image" || command.on === "photo") &&
                mek.type === "imageMessage"
            ) {
                command.function(client, mek, m, {
                    from, l, quoted, body, isCmd, command, args, q, isGroup, 
                    sender, senderNumber, botNumber2, botNumber, pushname, 
                    isMe, isOwner, groupMetadata, groupName, participants, 
                    groupAdmins, isBotAdmins, isAdmins, reply
                });
            } else if (
                command.on === "sticker" &&
                mek.type === "stickerMessage"
            ) {
                command.function(client, mek, m, {
                    from, l, quoted, body, isCmd, command, args, q, isGroup, 
                    sender, senderNumber, botNumber2, botNumber, pushname, 
                    isMe, isOwner, groupMetadata, groupName, participants, 
                    groupAdmins, isBotAdmins, isAdmins, reply
                });
            }
        });
    });

    return client;
}

app.get("/", (req, res) => {
    res.send("hey, bot started✅");
});

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

// Start the client
setTimeout(() => {
    clientstart().catch(err => {
        console.error('Failed to start client:', err);
        process.exit(1);
    });
}, 4000);
