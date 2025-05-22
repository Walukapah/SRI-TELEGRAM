const config = require('../config')
const {cmd, commands} = require('../command')

// Store the state of message logging
let messageLoggingEnabled = false;
let messageLogger = null;

cmd({
    pattern: "msginfo",
    desc: "Toggle message information logging (including newsletter detection)",
    category: "utility",
    filename: __filename
},
async(conn, mek, m, {from, quoted, reply}) => {
    try {
        if (m.args[0] === "on") {
            if (messageLoggingEnabled) {
                return reply("Message logging is already enabled.");
            }
            
            messageLoggingEnabled = true;
            
            // Setup message listener
            messageLogger = (async ({ messages }) => {
                const msg = messages[0];
                if (msg?.message?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo) {
                    console.log("\n=== Newsletter Message Detected ===");
                    console.log("Newsletter JID:", msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo.newsletterJid);
                    console.log("Newsletter Name:", msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo.newsletterName);
                    console.log("==================================\n");
                }
                
                // Log general message info
                console.log("\n=== Message Info ===");
                console.log("From:", msg.key.remoteJid);
                console.log("Timestamp:", new Date(msg.messageTimestamp * 1000));
                console.log("Message Type:", Object.keys(msg.message)[0]);
                console.log("=========================\n");
            });
            
            conn.ev.on('messages.upsert', messageLogger);
            reply("Message logging enabled. Check console for details.");
            
        } else if (m.args[0] === "off") {
            if (!messageLoggingEnabled) {
                return reply("Message logging is already disabled.");
            }
            
            messageLoggingEnabled = false;
            if (messageLogger) {
                conn.ev.off('messages.upsert', messageLogger);
                messageLogger = null;
            }
            reply("Message logging disabled.");
            
        } else {
            reply(`Usage: ${config.HANDLERS}msginfo on/off\nCurrent status: ${messageLoggingEnabled ? "ON" : "OFF"}`);
        }
    } catch (error) {
        console.error("Error in msginfo command:", error);
        reply("An error occurred while processing the command.");
    }
});
