const config = require('../config');
const {cmd, commands} = require('../command');
const { getBaileysMessage } = require('@whiskeysockets/baileys');

cmd({
    pattern: "chrinfo",
    desc: "Get WhatsApp channel information",
    category: "main",
    filename: __filename
},
async(conn, mek, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
    try {
        if (!q) return reply("Please provide a WhatsApp channel link.\nExample: .chrinfo https://whatsapp.com/channel/...");
        
        const channelId = extractChannelId(q);
        if (!channelId) return reply("Invalid channel link format. Please provide a valid WhatsApp channel link.");
        
        // Mock data - replace with actual API call
        const channelInfo = {
            id: channelId + "@newsletter",
            creationTime: new Date().getTime(),
            subject: "Channel Subject",
            subscribers: Math.floor(Math.random() * 1000),
            verified: Math.random() > 0.8
        };
        
        const creationDate = new Date(channelInfo.creationTime);
        const formattedTime = formatTime(creationDate);
        const currentTime = formatTime(new Date());
        
        const response = `# Channel WhatsApp Info\n\n` +
                        `- *ID:* ${channelInfo.id}\n` +
                        `- *Creation Time:* ${creationDate.getDate()}/${creationDate.getMonth() + 1}/${creationDate.getFullYear()}, ${formattedTime}\n` +
                        `- *Subject:* ${channelInfo.subject}\n` +
                        `- *Subscribers:* ${channelInfo.subscribers}\n` +
                        `- *Verified:* ${channelInfo.verified}\n\n` +
                        `${currentTime}\n\n` +
                        `_Information fetched by ${pushname}_`;
        
        
        
        // Simulate edited message (like in your screenshot)
        await new Promise(resolve => setTimeout(resolve, 3000));
        await reply(response);
        
    } catch(e) {
        console.log(e);
        reply(`Error fetching channel information: ${e.message}`);
    }
});

// Helper functions
function extractChannelId(link) {
    // Try different patterns to extract channel ID
    const patterns = [
        /channel\/([^\/]+)/,       // https://whatsapp.com/channel/ID
        /\/([A-Za-z0-9]+)$/,       // /ID at end of URL
        /\/0029([A-Za-z0-9]+)/     // /0029VaW9... pattern from your screenshot
    ];
    
    for (const pattern of patterns) {
        const match = link.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${minutes < 10 ? '0' + minutes : minutes} ${ampm}`;
}
