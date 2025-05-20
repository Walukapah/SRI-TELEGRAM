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

        // Check if response is valid and contains video URL
        if (!data || !data.tiktok || !data.tiktok.video) {
            return reply("Failed to get video URL from API response");
        }

        const videoUrl = data.tiktok.video;
        const description = data.tiktok.description || "No description";
        const author = data.tiktok.author?.nickname || "Unknown author";
        const likes = data.tiktok.statistics?.likeCount || "N/A";
        
        // Create caption with video info
        const caption = `
📝 *Description:* ${description}
👤 *Author:* ${author}
❤️ *Likes:* ${likes}

*Downloaded by Sri-Bot*`;

        // Send video with metadata
        await conn.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: "video/mp4",
            caption: caption
        }, { quoted: mek });

    } catch (error) {
        console.error('TikTok download error:', error);
        reply("Failed to download. Please try another link or try again later");
    }
});
