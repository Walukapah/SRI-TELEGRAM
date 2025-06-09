const config = require('../config');
const moment = require('moment-timezone');
const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
  pattern: "menu",
  alias: ["allmenu", "srim"],
  use: '.menu',
  desc: "Show all bot commands",
  category: "menu",
  react: "📜",
  filename: __filename
},
async (conn, mek, m, { from, reply }) => {
  try {
    const totalCommands = commands.length;
    const date = moment().tz("America/Port-au-Prince").format("dddd, DD MMMM YYYY");

    const uptime = () => {
      let sec = process.uptime();
      let h = Math.floor(sec / 3600);
      let m = Math.floor((sec % 3600) / 60);
      let s = Math.floor(sec % 60);
      return `${h}h ${m}m ${s}s`;
    };

    // Menu principal
    let menuText = `
*╭══ SRI-BOT*
*┃❃* *USER* : @${m.sender.split("@")[0]}
*┃❃* *RUNTIME* : ${uptime()}
*┃❃* *MODE* : *${config.MODE}*
*┃❃* *PREFIX* : [ ${config.PREFIX} ]
*┃❃* *PLUGIN* : ${totalCommands}
*┃❃* *DEVELOPER* : *WALUKA*
*┃❃* *VERSIONS* : *${config.VERSION}*
*┕──────────────❒*
`;

    // Catégories et commandes
    let category = {};
    for (let cmd of commands) {
      if (!cmd.category) continue;
      if (!category[cmd.category]) category[cmd.category] = [];
      category[cmd.category].push(cmd);
    }

    const keys = Object.keys(category).sort();
    for (let k of keys) {
      menuText += `\n\n*╭─❝${k.toUpperCase()} MENU*❞`;
      const cmds = category[k].filter(c => c.pattern).sort((a, b) => a.pattern.localeCompare(b.pattern));
      cmds.forEach((cmd) => {
        const usage = cmd.pattern.split('|')[0];
        menuText += `\n├◯ ${config.PREFIX}${usage}`;
      });
      menuText += `\n*┕─────────────▩⫸*`;
    }

    // First try sending as image with caption
    try {
      await conn.sendMessage(from, { 
        //image: { url: config.MENU_IMG_URL },
        caption: menuText,
        contextInfo: {
          mentionedJid: [m.sender],
          externalAdReply: {
            showAdAttribution: true,
            title: 'SRI BOT MENU LIST ♲',
            body: 'SRI BOT 🇱🇰',
            thumbnailUrl: config.MENU_IMG_URL,
            sourceUrl: config.MEDIA_URL,
            mediaType: 1
          }
        }
      }, { quoted: mek });
    } catch (e) {
      // If image fails, send as text only
      console.error("Image send failed, falling back to text:", e);
      await conn.sendMessage(from, { 
        text: menuText,
        contextInfo: {
          mentionedJid: [m.sender],
          externalAdReply: {
            showAdAttribution: true,
            title: '𝗜 𝗔𝗠 𝗔𝗟𝗜𝗩𝗘 𝗠𝗢𝗧𝗛𝗘𝗥𝗙𝗨𝗖𝗞𝗘𝗥',
            body: 'SRI BOT 🇱🇰',
            thumbnailUrl: config.MENU_IMG_URL,
            sourceUrl: config.MEDIA_URL,
            mediaType: 1
          }
        }
      }, { quoted: mek });
    }

  } catch (e) {
    console.error(e);
    reply(`❌ Error: ${e.message}`);
  }
});
