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

        // Debug: Log the API response
        console.log("API Response:", JSON.stringify(data, null, 2));

        if (!data || !data.success || !data.tiktok || !data.tiktok.video) {
            console.error('Invalid API response structure');
            return reply("Failed to download video. Invalid API response");
        }

        const videoUrl = data.tiktok.video;
        const description = data.tiktok.description || "No description";
        const author = data.tiktok.author?.nickname || "Unknown author";

        await conn.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: "video/mp4",
            caption: `🎬 *${author}*\n📝 ${description}\n\n𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗗 𝗕𝗬 𝗦𝗥𝗜-𝗕𝗢𝗧`
        }, { quoted: mek, uploadTimeoutMs: 60000 });

    } catch (error) {
        console.error('TikTok download error:', error);
        reply("Failed to download. Error: " + error.message);
    }
});
