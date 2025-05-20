const config = require('../config');
const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
    pattern: "tiktok",
    desc: "Download TikTok videos via API",
    category: "download",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    try {
        // Extract text from the message
        const text = m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
        const url = text.split(' ').slice(1).join(' ').trim();
        
        if (!url) return reply("Please provide a TikTok URL\nExample: .tiktok https://vm.tiktok.com/xyz");

        // Validate TikTok URL
        if (!/https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//.test(url)) {
            return reply("Invalid TikTok URL. Please provide a valid link");
        }

        await conn.sendMessage(from, { react: { text: '🔄', key: mek.key } });

        const apiUrl = `https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl);

        if (!data?.status === 200 || !data?.tiktok?.video) {
            return reply("Failed to download video. The API may be down or the link is invalid");
        }

        await conn.sendMessage(from, {
            video: { url: data.tiktok.video },
            mimetype: "video/mp4",
            caption: "𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗦𝗥𝗜-𝗕𝗢𝗧"
        }, { quoted: mek });

    } catch (error) {
        console.error('TikTok download error:', error);
        reply("Failed to download. Please try another link");
    }
});
