const config = require('../config')
const {cmd, commands} = require('../command')

// minfo command
cmd({
    pattern: "minfo",
    desc: "Get message logging info and toggle settings",
    category: "main",
    filename: __filename,
    use: '<on/off>'
},
async(conn, mek, m, {from, reply}) => {
    try {
        const args = m.body.trim().split(/ +/).slice(1)
        const action = args[0]?.toLowerCase()
        
        if (action === 'on' || action === 'off') {
            config.MESSAGE_LOG_INFO = action === 'on'
            fs.writeFileSync('./config.js', 
                `module.exports = ${JSON.stringify(config, null, 2)}`)
            return reply(`Message logging ${config.MESSAGE_LOG_INFO ? 'enabled ✅' : 'disabled ❌'}`)
        }
        
        const status = config.MESSAGE_LOG_INFO ? 'Enabled ✅' : 'Disabled ❌'
        const helpText = `📊 *Message Logging Info*
        
🔹 Current Status: ${status}
🔹 Usage: .minfo on/off
🔹 Description: Toggles detailed message logging in console

ℹ️ Logging includes:
- Message type
- Sender info
- Content preview
- Group details (if group message)
- Media info (size, duration etc)`

        return reply(helpText)
    } catch(e) {
        console.error(e)
        reply(`Error: ${e.message}`)
    }
})


// Enhanced Message Logging with config check
conn.ev.on('messages.upsert', async(mek) => {
    if (!config.MESSAGE_LOG_INFO) return;
    
    try {
        // Create timestamp with Sri Lanka timezone
        const timestamp = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Colombo',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Message separator
        console.log('\n' + '='.repeat(60));
        console.log(`📩 [${timestamp}] NEW MESSAGE RECEIVED`);
        
        const message = mek.messages[0];
        if (!message) return;

        // Sender information
        const senderJid = message.key.remoteJid;
        const isGroup = senderJid.endsWith('@g.us');
        const pushName = message.pushName || 'Unknown';
        
        // Basic message info
        console.log(`🔹 From: ${isGroup ? 'Group' : 'Private'} - ${senderJid}`);
        console.log(`🔹 Sender: ${pushName}`);
        console.log(`🔹 Message ID: ${message.key.id}`);
        
        // Message type detection
        const messageType = getContentType(message.message);
        let content = '';
        let additionalInfo = '';

        // Content extraction based on message type
        switch (messageType) {
            case 'conversation':
                content = message.message.conversation;
                break;
            case 'extendedTextMessage':
                content = message.message.extendedTextMessage.text;
                if (message.message.extendedTextMessage.contextInfo?.quotedMessage) {
                    additionalInfo += '🔹 Quoted Message: Yes\n';
                }
                break;
            case 'imageMessage':
                content = message.message.imageMessage.caption || '[Image without caption]';
                additionalInfo += `🔹 Image Dimensions: ${message.message.imageMessage.width}x${message.message.imageMessage.height}\n`;
                additionalInfo += `🔹 Image Size: ${(message.message.imageMessage.fileLength / 1024).toFixed(2)} KB\n`;
                break;
            case 'videoMessage':
                content = message.message.videoMessage.caption || '[Video without caption]';
                additionalInfo += `🔹 Video Duration: ${message.message.videoMessage.seconds}s\n`;
                additionalInfo += `🔹 Video Size: ${(message.message.videoMessage.fileLength / (1024 * 1024)).toFixed(2)} MB\n`;
                break;
            case 'audioMessage':
                content = '[Audio message]';
                additionalInfo += `🔹 Audio Duration: ${message.message.audioMessage.seconds}s\n`;
                additionalInfo += `🔹 Audio Type: ${message.message.audioMessage.mimetype || 'Unknown'}\n`;
                break;
            case 'stickerMessage':
                content = '[Sticker]';
                additionalInfo += `🔹 Sticker Emoji: ${message.message.stickerMessage.emoji || 'None'}\n`;
                additionalInfo += `🔹 Sticker Size: ${(message.message.stickerMessage.fileLength / 1024).toFixed(2)} KB\n`;
                break;
            case 'locationMessage':
                const loc = message.message.locationMessage;
                content = `📍 Location: ${loc.degreesLatitude}, ${loc.degreesLongitude}`;
                additionalInfo += `🔹 Location Name: ${loc.name || 'Not specified'}\n`;
                break;
            case 'buttonsResponseMessage':
                content = `🛑 Selected Button: ${message.message.buttonsResponseMessage.selectedButtonId}`;
                break;
            case 'reactionMessage':
                content = `Reacted with: ${message.message.reactionMessage.text}`;
                additionalInfo += `🔹 To Message ID: ${message.message.reactionMessage.key.id}\n`;
                break;
            default:
                content = `[Unhandled message type: ${messageType}]`;
        }

        // Display message content (trimmed if too long)
        console.log(`🔹 Message Type: ${messageType}`);
        if (additionalInfo) console.log(additionalInfo.trim());
        console.log(`🔹 Content Preview: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`);
        
        // Message status
        if (message.key.fromMe) {
            console.log('🔹 Status: Sent by this bot');
        }

        // Group specific info
        if (isGroup) {
            const groupMetadata = await conn.groupMetadata(senderJid).catch(e => {});
            if (groupMetadata) {
                console.log(`🔹 Group Name: ${groupMetadata.subject}`);
                console.log(`🔹 Participants: ${groupMetadata.participants.length}`);
            }
        }

        // End of message log
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('❌ ERROR IN MESSAGE PROCESSING:', error);
    }
});
