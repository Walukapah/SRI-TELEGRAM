const config = require('../config');
const { cmd, commands } = require('../command');

cmd({
    pattern: "menu3",
    desc: "Show main interactive menu",
    category: "utility",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    try {
        await conn.sendMessage(from, {
            text: "✨ *PRABATH-MD BETA PUBLIC* ✨\n\n📱 *Contact:* +234 816 597 5051\n🌍 *Multi-Numbers Support*\n\n📤 *Share:* 451\n👀 *Views:* 428,656",
            footer: "Select an option below",
            buttons: [
                { buttonId: 'main_menu', buttonText: { displayText: "📋 MAIN MENU" }, type: 1 },
                { buttonId: 'ai_menu', buttonText: { displayText: "🤖 AI MENU" }, type: 1 },
                { buttonId: 'search_menu', buttonText: { displayText: "🔍 SEARCH MENU" }, type: 1 },
                { buttonId: 'download_menu', buttonText: { displayText: "⬇️ DOWNLOAD MENU" }, type: 1 },
                { buttonId: 'owner_menu', buttonText: { displayText: "👑 OWNER MENU" }, type: 1 },
                { buttonId: 'convert_menu', buttonText: { displayText: "🔄 CONVERT MENU" }, type: 1 },
                { buttonId: 'group_menu', buttonText: { displayText: "👥 GROUP MENU" }, type: 1 },
                { buttonId: 'sticker_menu', buttonText: { displayText: "🖼️ STICKER MENU" }, type: 1 },
                { buttonId: 'game_menu', buttonText: { displayText: "🎮 GAME MENU" }, type: 1 },
                { buttonId: 'mathtool_menu', buttonText: { displayText: "🧮 MATHTOOL MENU" }, type: 1 }
            ],
            headerType: 1,
            
        }, { quoted: mek });

        // Handle button responses
        conn.ev.on('messages.upsert', async({ messages }) => {
            const msg = messages[0];
            if (msg?.message?.buttonsResponseMessage?.selectedButtonId && 
                msg.key.remoteJid === from && 
                msg.key.fromMe === false) {
                
                const selectedId = msg.message.buttonsResponseMessage.selectedButtonId;
                let responseText = "";
                
                switch(selectedId) {
                    case 'main_menu':
                        responseText = "📋 *MAIN MENU*\n\n• Command 1\n• Command 2\n• Command 3";
                        break;
                    case 'ai_menu':
                        responseText = "🤖 *AI MENU*\n\n• AI Chat\n• Image Generation\n• Text Processing";
                        break;
                    case 'search_menu':
                        responseText = "🔍 *SEARCH MENU*\n\n• Google Search\n• YouTube Search\n• Wikipedia";
                        break;
                    case 'download_menu':
                        responseText = "⬇️ *DOWNLOAD MENU*\n\n• YouTube DL\n• Instagram DL\n• Facebook DL";
                        break;
                    case 'owner_menu':
                        responseText = "👑 *OWNER MENU*\n\n• Bot Status\n• Broadcast\n• Maintenance";
                        break;
                    case 'convert_menu':
                        responseText = "🔄 *CONVERT MENU*\n\n• Audio Convert\n• Video Convert\n• Document Convert";
                        break;
                    case 'group_menu':
                        responseText = "👥 *GROUP MENU*\n\n• Group Settings\n• Member Management\n• Group Info";
                        break;
                    case 'sticker_menu':
                        responseText = "🖼️ *STICKER MENU*\n\n• Create Sticker\n• Sticker Pack\n• Sticker Info";
                        break;
                    case 'game_menu':
                        responseText = "🎮 *GAME MENU*\n\n• Word Game\n• Quiz Game\n• RPG Game";
                        break;
                    case 'mathtool_menu':
                        responseText = "🧮 *MATHTOOL MENU*\n\n• Calculator\n• Unit Convert\n• Math Formulas";
                        break;
                }

                await conn.sendMessage(from, { 
                    text: responseText,
                    buttons: [
                        { buttonId: 'back_to_main', buttonText: { displayText: "🔙 Back to Main Menu" }, type: 1 }
                    ]
                }, { quoted: msg });
            }
        });

    } catch (error) {
        console.error('Menu error:', error);
        reply("Failed to load menu. Please try again.");
    }
});
