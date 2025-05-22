const config = require('../config')
const {cmd, commands} = require('../command')

let logMessageInfo = false;

cmd({
    pattern: "msginfo",
    desc: "Toggle message information logging on/off",
    category: "main",
    filename: __filename
},
async(conn, mek, m, {from, quoted, reply}) => {
    try {
        logMessageInfo = !logMessageInfo; // Toggle the state
        
        if (logMessageInfo) {
            // Add the event listener when turned on
            conn.ev.on('messages.upsert', messageInfoHandler);
            await reply("Message info logging turned ON ✅");
        } else {
            // Remove the event listener when turned off
            conn.ev.off('messages.upsert', messageInfoHandler);
            await reply("Message info logging turned OFF ❌");
        }
    } catch (error) {
        console.error("Error in msginfo command:", error);
        await reply("An error occurred while toggling message info logging.");
    }
});

// Separate handler function that we can add/remove
function messageInfoHandler({ messages }) {
    const msg = messages[0];
    if (msg?.message?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo) {
        console.log("\n--- Message Info ---");
        console.log("Newsletter JID:", msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo.newsletterJid);
        console.log("Newsletter Name:", msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo.newsletterName);
        console.log("--- End of Info ---\n");
    }
    
    // You can add more message info logging here as needed
}
