const config = require('../config')
const {cmd, commands} = require('../command')

cmd({
  pattern: "getnewsletter",
  desc: "Get Newsletter JID and Name from forwarded message",
  category: "main",
  filename: __filename
},
async (conn, mek, m, {
  from, quoted, reply
}) => {
  try {
    const contextInfo = quoted?.message?.extendedTextMessage?.contextInfo 
                      || quoted?.message?.imageMessage?.contextInfo 
                      || quoted?.message?.videoMessage?.contextInfo 
                      || null;

    if (!contextInfo?.forwardedNewsletterMessageInfo) {
      return reply("Please reply to a *forwarded message from a Channel* (Newsletter).");
    }

    const info = contextInfo.forwardedNewsletterMessageInfo;
    const jid = info.newsletterJid;
    const name = info.newsletterName;

    await reply(`*Newsletter Info:*\n\n• JID: \`${jid}\`\n• Name: ${name}`);
  } catch (e) {
    console.log(e);
    reply("Error: " + e.message);
  }
});
