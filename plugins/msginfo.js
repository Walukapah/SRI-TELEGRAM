const config = require('../config')
const {cmd, commands} = require('../command')

cmd({
    pattern: "msginfo",
    desc: "Extract Newsletter JID from forwarded messages",
    category: "main",//utility
    filename: __filename
},
async(conn, mek, m, {from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
    try {
        // Check if the message is quoted
        if (!quoted) {
            return reply("❗ කරුණාකර Newsletter එකකින් forward කරපු message එකක් reply කරන්න");
        }

        // Extract newsletter info from quoted message
        const newsletterInfo = quoted.message?.contextInfo?.forwardedNewsletterMessageInfo;
        
        if (!newsletterInfo) {
            return reply("❌ මෙම message එක Newsletter එකකින් forward කරපු එකක් නොවේ");
        }

        const newsletterJid = newsletterInfo.newsletterJid;
        const newsletterName = newsletterInfo.newsletterName || "නොදනී";

        // Send the extracted information back to user
        await conn.sendMessage(from, {
            text: `📰 *Newsletter තොරතුරු*\n\n` +
                  `🔹 *නම:* ${newsletterName}\n` +
                  `🔸 *JID:* ${newsletterJid}\n\n` +
                  `ℹ️ මෙම JID එක භාවිතා කරන්න ඔබගේ bot commands වලට`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true
            }
        }, {quoted: mek});

    } catch(e) {
        console.error('Error in msginfo command:', e);
        reply(`❌ දෝෂයක් ඇතිවිය: ${e.message}`);
    }
});
