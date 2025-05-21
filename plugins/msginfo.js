const config = require('../config')
const {cmd, commands} = require('../command')

cmd({
    pattern: "msginfo",
    desc: "Extract detailed message information including newsletter detection",
    category: "utility",
    filename: __filename
},
async(conn, mek, m, {from, quoted, reply}) => {
    try {
        const targetMsg = quoted || m;
        
        if (!targetMsg.message) {
            return reply("❗ කරුණාකර message එකක් reply කරන්න");
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
        
        let response = `📌 *Message Analysis*\n\n`;
        response += `🔹 *Message Type:* ${msgType}\n`;
        
        if (newsletterInfo) {
            response += `✅ *Newsletter Detected!*\n`;
            response += `📛 Name: ${newsletterInfo.newsletterName}\n`;
            response += `🔢 JID: ${newsletterInfo.newsletterJid}\n\n`;
            response += `ℹ️ මෙය නිව්ස්ලෙටර් එකකින් එවන ලද පණිවිඩයකි`;
        } else {
            response += `❌ *Not a Newsletter Message*\n\n`;
            response += `ℹ️ මෙම පණිවිඩය නිව්ස්ලෙටර් එකකින් එවන ලද්දක් නොවේ\n`;
            response += `හේතුව: පණිවිඩයේ newsletter JID හෝ නිව්ස්ලෙටර් ලක්ෂණ හමු නොවීය`;
        }

        // Additional debug info
        console.log("Raw Message:", JSON.stringify(targetMsg, null, 2));
        
        await conn.sendMessage(from, { 
            text: response,
            contextInfo: { forwardingScore: 1 }
        }, { quoted: mek });

    } catch(e) {
        console.error('Error:', e);
        reply(`❌ දෝෂයක්: ${e.message}`);
    }
});
