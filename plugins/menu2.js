const config = require('../config');
const moment = require('moment-timezone');
const { cmd, commands } = require('../command');
const axios = require('axios');
const font = require("@viper-x/fancytext");
const menust = config.MENU_FONT;
const style = font[menust];
const more = String.fromCharCode(8206);
const readMore = more.repeat(4001);

cmd({
  pattern: "menu",
  alias: ["help", "allmenu"],
  use: '.menu',
  desc: "Show all bot commands",
  category: "misc",
  react: "📜",
  filename: __filename
},
async (conn, mek, m, { from, reply }) => {
  try {
    const totalCommands = commands.length;
    const date = moment().tz("Asia/Colombo").format("dddd, DD MMMM YYYY");
    const time = moment().tz("Asia/Colombo").format("HH:mm:ss");

    const uptime = () => {
      let sec = process.uptime();
      let h = Math.floor(sec / 3600);
      let m = Math.floor((sec % 3600) / 60);
      let s = Math.floor(sec % 60);
      return `${h}h ${m}m ${s}s`;
    };

    // Main menu header
    let menuText = `╭══〘 ${style(config.BOT_NAME || "BOT")} 〙══⊷❙\n`;
    menuText += `┃╭─────────────────\n`;
    menuText += `┃│➛ 𝗨𝗦𝗘𝗥 : @${m.sender.split("@")[0]}\n`;
    menuText += `┃│➛ 𝗢𝗪𝗡𝗘𝗥 : ${style(config.OWNER_NAME || "Owner")}\n`;
    menuText += `┃│➛ 𝗣𝗥𝗘𝗙𝗜𝗫 : [ ${m.prefix} ]\n`;
    menuText += `┃│➛ 𝗗𝗔𝗧𝗘 : ${date}\n`;
    menuText += `┃│➛ 𝗧𝗜𝗠𝗘 : ${time}\n`;
    menuText += `┃│➛ 𝗨𝗣𝗧𝗜𝗠𝗘 : ${uptime()}\n`;
    menuText += `┃│➛ 𝗖𝗠𝗗𝗦 : ${totalCommands}\n`;
    menuText += `┃│➛ 𝗩𝗘𝗥𝗦𝗜𝗢𝗡 : ${config.VERSION || "1.0.0"}\n`;
    menuText += `┃╰─────────────────\n`;
    menuText += `╰════════════════⊷❙\n\n${readMore}\n\n`;

    // Categorize commands
    let categories = {};
    commands.forEach((cmd) => {
      if (!cmd.pattern || cmd.dontAddCommandList) return;
      const category = cmd.category || 'misc';
      if (!categories[category]) categories[category] = [];
      categories[category].push(cmd);
    });

    // Add commands to menu by category
    Object.keys(categories).sort().forEach((cat) => {
      menuText += `╭───『 ${style(cat.toUpperCase())} 』───⦿\n`;
      categories[cat].sort((a, b) => {
        const aCmd = a.pattern.toString().split('|')[0].replace(/[^a-zA-Z]/g, '');
        const bCmd = b.pattern.toString().split('|')[0].replace(/[^a-zA-Z]/g, '');
        return aCmd.localeCompare(bCmd);
      }).forEach((cmd) => {
        const cmdName = cmd.pattern.toString().split('|')[0].replace(/[^a-zA-Z]/g, '');
        menuText += `│› ${m.prefix}${style(cmdName)}\n`;
      });
      menuText += `╰─────────────────⦿\n\n`;
    });

    // Context info for all message types
    const contextInfo = {
      mentionedJid: [m.sender],
      externalAdReply: {
        title: `${config.BOT_NAME || "BOT"} Menu`,
        body: `Total ${totalCommands} Commands`,
        thumbnailUrl: config.MENU_IMG_URL || "https://i.imgur.com/W2CaVZW.jpeg",
        sourceUrl: config.WEBSITE || "https://github.com",
        mediaType: 1,
        renderLargerThumbnail: true
      }
    };

    // Menu type handling
    switch(config.MENU_TYPE.toLowerCase()) {
      case 'big':
        return await conn.sendMessage(from, {
          text: style(menuText),
          contextInfo: contextInfo
        }, { quoted: mek });

      case 'small':
        return await conn.sendMessage(from, {
          text: style(menuText),
          contextInfo: {
            ...contextInfo,
            externalAdReply: {
              ...contextInfo.externalAdReply,
              renderLargerThumbnail: false
            }
          }
        }, { quoted: mek });

      case 'image':
        return await conn.sendMessage(from, {
          image: { url: config.MENU_IMG_URL || "https://i.imgur.com/W2CaVZW.jpeg" },
          caption: style(menuText),
          contextInfo: contextInfo
        }, { quoted: mek });

      case 'document':
        return await conn.sendMessage(from, {
          document: { url: config.MENU_IMG_URL || "https://i.imgur.com/W2CaVZW.jpeg" },
          mimetype: 'application/pdf',
          fileName: `${config.BOT_NAME || "BOT"} Menu.pdf`,
          caption: style(menuText),
          contextInfo: contextInfo
        }, { quoted: mek });

      case 'text':
        return await conn.sendMessage(from, {
          text: style(menuText)
        }, { quoted: mek });

      case 'call':
        return await conn.relayMessage(from, {
          viewOnceMessage: {
            message: {
              scheduledCallCreationMessage: {
                scheduledTimestampMs: Date.now(),
                callType: 1,
                title: style(menuText)
              }
            }
          }
        }, {});

      case 'payment':
        return await conn.relayMessage(from, {
          requestPaymentMessage: {
            currencyCodeIso4217: 'USD',
            amount1000: '1000000',
            requestFrom: m.sender,
            noteMessage: {
              extendedTextMessage: {
                text: style(menuText)
              }
            }
          }
        }, {});

      default:
        return await conn.sendMessage(from, {
          image: { url: config.MENU_IMG_URL || "https://i.imgur.com/W2CaVZW.jpeg" },
          caption: style(menuText),
          contextInfo: contextInfo
        }, { quoted: mek });
    }
  } catch (error) {
    console.error("Menu error:", error);
    return reply(style(`❌ Error: ${error.message}`));
  }
});
