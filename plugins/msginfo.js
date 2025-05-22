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
        if (m.args && m.args[0] === "on") {
            if (messageLoggingEnabled) {
                return reply("Message logging is already enabled.");
            }
            
            messageLoggingEnabled = true;
            
            // Setup message listener
            messageLogger = (async ({ messages }) => {
                try {
                    if (!messages || !messages[0]) return;
                    
                    const msg = messages[0];
                    
                    // Newsletter detection
                    if (msg?.message?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo) {
                        console.log("\n=== Newsletter Message Detected ===");
                        console.log("Newsletter JID:", msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo.newsletterJid);
                        console.log("Newsletter Name:", msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo.newsletterName);
                        console.log("==================================\n");
                    }
                    
                    // Basic message info
                    if (msg.key && msg.messageTimestamp) {
                        console.log("\n=== Message Info ===");
                        console.log("From:", msg.key.remoteJid || "N/A");
                        console.log("Timestamp:", msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : "N/A");
                        
                        if (msg.message) {
                            const messageType = Object.keys(msg.message)[0];
                            console.log("Message Type:", messageType || "N/A");
                        }
                        console.log("=========================\n");
                    }
                } catch (e) {
                    console.error("Error in message logger:", e);
                }
            });
            
            conn.ev.on('messages.upsert', messageLogger);
            reply("Message logging enabled. Check console for details.");
            
        } else if (m.args && m.args[0] === "off") {
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
