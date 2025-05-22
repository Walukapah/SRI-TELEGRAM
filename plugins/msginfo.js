const config = require('../config')
const {cmd, commands} = require('../command')

cmd({
    pattern: "msginfo",
    desc: "Extract detailed message information including newsletter detection",
    category: "main",//utility
    filename: __filename
},
async(conn, mek, m, {from, quoted, reply}) => {
    try {
        const targetMsg = quoted || m;
        
        if (!targetMsg.message) {
            return reply("❗ Please reply to a message");
        }

        // Enhanced newsletter detection
        const detectNewsletter = (msg) => {
            // Method 1: Check standard newsletter info
            if (msg.message?.contextInfo?.forwardedNewsletterMessageInfo) {
                return msg.message.contextInfo.forwardedNewsletterMessageInfo;
            }
            
            // Method 2: Check for newsletter pattern in forwarded messages
            if (msg.message?.extendedTextMessage?.contextInfo?.isForwarded) {
                const text = msg.message.extendedTextMessage.text || '';
                if (text.includes('@newsletter') || text.includes('Forwarded from')) {
                    const jidMatch = text.match(/\d+@newsletter/);
                    const nameMatch = text.match(/Forwarded from (.+?)\n/);
                    return {
                        newsletterJid: jidMatch ? jidMatch[0] : 'unknown@newsletter',
                        newsletterName: nameMatch ? nameMatch[1] : 'Unknown Newsletter'
                    };
                }
            }
            
            return null;
        };

        const newsletterInfo = detectNewsletter(targetMsg);
        const msgType = Object.keys(targetMsg.message)[0];
        
        // Format the raw message for display
        const rawMessageStr = JSON.stringify(targetMsg, null, 2)
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '    ')
            .replace(/\\"/g, '"');
        
        // Console output with full details
        console.log('\n=== FULL MESSAGE DETAILS ===');
        console.log(rawMessageStr);
        console.log('===========================\n');
        
        // Chat response
        let response = `📌 *Message Analysis*\n\n`;
        response += `🔹 *Message Type:* ${msgType}\n`;
        
        if (newsletterInfo) {
            response += `✅ *Newsletter Detected!*\n`;
            response += `📛 Name: ${newsletterInfo.newsletterName}\n`;
            response += `🔢 JID: ${newsletterInfo.newsletterJid}\n\n`;
            response += `ℹ️ This is a message forwarded from a newsletter`;
        } else {
            response += `❌ *Not a Newsletter Message*\n\n`;
            response += `ℹ️ This message is not from a newsletter\n`;
            response += `Reason: No newsletter JID or newsletter features found`;
        }

        response += `\n\n🔍 *Raw data has been logged to console*`;
        
        await conn.sendMessage(from, { 
            text: response,
            contextInfo: { forwardingScore: 1 }
        }, { quoted: mek });

    } catch(e) {
        console.error('Error:', e);
        reply(`❌ Error: ${e.message}`);
    }
});
