const { cmd } = require('../command');
const fg = require('api-dylux');
const yts = require('yt-search');

async function downloadMedia(type, q, reply, conn, from, mek) {
  if (!q) return reply("Please give URL / title 📎");
  
  const search = await yts(q);
  const data = search.videos[0];
  const url = data.url;
  
  let desc = `
 ⚡ *SRIBOT ${type.toUpperCase()} DOWNLOADER* ⚡
 
 *Title*: ${data.title}
 *Description*: ${data.description}
 *Time*: ${data.timestamp}
 *Ago*: ${data.ago}
 *Views*: ${data.views}
 
 *MADE BY SRIBOT* 👤
  `;
  
  await conn.sendMessage(from, { image: { url: data.thumbnail }, caption: desc }, { quoted: mek });
  
  let down;
  if (type === 'song') {
    down = await fg.yta('url');
  } else {
    down = await fg.ytv('url');
  }
  const downloadUrl = down.dl_url;
  
  if (type === 'song') {
    await conn.sendMessage(from, { audio: { url: downloadUrl }, mimetype: "audio/mpeg" }, { quoted: mek });
  } else {
    await conn.sendMessage(from, { video: { url: downloadUrl }, mimetype: "video/mp4" }, { quoted: mek });
  }
}

cmd({
  pattern: "song",
  desc: "Download the song",
  category: "download",
  filename: __filename
}, async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
  try {
    await downloadMedia('song', q, reply, conn, from, mek);
  } catch (e) {
    console.log(e);
    reply(`${e}`);
  }
});

cmd({
  pattern: "video",
  desc: "Download the video",
  category: "download",
  filename: __filename
}, async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
  try {
    await downloadMedia('video', q, reply, conn, from, mek);
  } catch (e) {
    console.log(e);
    reply(`${e}`);
  }
});
