const config = require('../config')
const {cmd, commands} = require('../command')

cmd({
    pattern: "msginfo",
    desc: "Extract detailed message information including newsletter detection",
    category: "main",
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
                const info = msg.message.contextInfo.forwardedNewsletterMessageInfo;
                return {
                    type: 'direct',
                    newsletterJid: info.newsletterJID,
                    newsletterName: info.newsletterName,
                    serverId: info.serverID,
                    viewCount: msg.message?.contextInfo?.forwardingScore || 0
                };
            }
            
            // Method 2: Check for channel forwarded messages
            if (msg.message?.extendedTextMessage?.contextInfo?.isForwarded) {
                const text = msg.message.extendedTextMessage.text || '';
                
                // Channel pattern detection
                const channelPattern1 = text.match(/Forwarded from (.+?)\n/);
                const channelPattern2 = text.match(/@(\d+)\n/);
                
                if (channelPattern1 || channelPattern2) {
                    return {
                        type: 'channel_forward',
                        newsletterJid: channelPattern2 ? `${channelPattern2[1]}@newsletter` : 'unknown@newsletter',
                        newsletterName: channelPattern1 ? channelPattern1[1] : 'Unknown Channel',
                        viewCount: msg.message?.contextInfo?.forwardingScore || 0
                    };
                }
            }
            
            // Method 3: Check for newsletter mentions in text
            const newsletterMention = msg.message?.extendedTextMessage?.text?.match(/(\d+)@newsletter/);
            if (newsletterMention) {
                return {
                    type: 'mentioned',
                    newsletterJid: newsletterMention[0],
                    newsletterName: 'Mentioned Newsletter',
                    viewCount: msg.message?.contextInfo?.forwardingScore || 0
                };
            }
            
            return null;
        };

        const newsletterInfo = detectNewsletter(targetMsg);
        const msgType = Object.keys(targetMsg.message)[0];
        const viewCount = targetMsg.message?.contextInfo?.forwardingScore || 0;
        
        let response = `📌 *Message Analysis*\n\n`;
        response += `🔹 *Message Type:* ${msgType}\n`;
        response += `👁️ *View Count:* ${viewCount}\n\n`;
        
        if (newsletterInfo) {
            response += `✅ *Newsletter/Channel Detected!*\n`;
            response += `📛 *Name:* ${newsletterInfo.newsletterName}\n`;
            response += `🔢 *JID:* ${newsletterInfo.newsletterJid}\n`;
            response += `📤 *Source:* ${newsletterInfo.type === 'direct' ? 'Direct Newsletter' : 
                          newsletterInfo.type === 'channel_forward' ? 'Forwarded from Channel' : 'Mentioned'}\n\n`;
            
            if (newsletterInfo.type === 'channel_forward') {
                response += `ℹ️ මෙය චැනලයකින් එවන ලද පණිවිඩයකි (නිව්ස්ලෙටර් ලෙස හඳුනාගත්ත)\n`;
                response += `⚠️ සැලකිය යුතුයි: චැනල පණිවිඩ සමහර විට නිව්ස්ලෙටර් ලෙස හඳුනාගත හැකිය\n`;
            } else {
                response += `ℹ️ මෙය නිව්ස්ලෙටර් එකකින් එවන ලද පණිවිඩයකි\n`;
            }
        } else {
            response += `❌ *Not a Newsletter/Channel Message*\n\n`;
            response += `ℹ️ මෙම පණිවිඩය නිව්ස්ලෙටර් හෝ චැනලයකින් එවන ලද්දක් නොවේ\n`;
        }

        // Add raw message info for debugging
        response += `\n🔍 *Debug Info:*\n`;
        response += `Message Keys: ${Object.keys(targetMsg.message).join(', ')}\n`;
        if (targetMsg.message?.contextInfo) {
            response += `Context Info: Present\n`;
        } else {
            response += `Context Info: Not Present\n`;
        }

        await conn.sendMessage(from, { 
            text: response,
            contextInfo: { forwardingScore: 1 }
        }, { quoted: mek });

    } catch(e) {
        console.error('Error:', e);
        reply(`❌ දෝෂයක්: ${e.message}`);
    }
});
