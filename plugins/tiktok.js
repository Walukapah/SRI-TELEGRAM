const config = require('../config');
const { cmd, commands } = require('../command');
const { ttdl } = require("ruhend-scraper");
const axios = require('axios');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

// TikTok download command
cmd({
    pattern: "tiktok",
    desc: "Download TikTok videos",
    category: "download",
    filename: __filename
},
async(conn, mek, { args, reply }) => {
    try {
        // Check for duplicates
        if (processedMessages.has(mek.key.id)) return;
        processedMessages.add(mek.key.id);
        
        // Clean up after 5 minutes
        setTimeout(() => processedMessages.delete(mek.key.id), 300000);

        const url = args.join(' ').trim();
        if (!url) return reply("Please provide a TikTok URL");

        // Validate TikTok URL
        const tiktokPatterns = [
            /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//,
            /https?:\/\/(?:www\.)?tiktok\.com\/[@t]\//
        ];

        if (!tiktokPatterns.some(pattern => pattern.test(url))) {
            return reply("Invalid TikTok URL. Please provide a valid link");
        }

        await conn.sendMessage(mek.from, { react: { text: '🔄', key: mek.key } });

        try {
            // Try direct download first
            let downloadData = await ttdl(url);
            
            // Fallback to API if needed
            if (!downloadData?.data?.length) {
                const apiRes = await axios.get(`https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`);
                if (apiRes.data?.status === 200 && apiRes.data.tiktok?.video) {
                    return await conn.sendMessage(mek.from, {
                        video: { url: apiRes.data.tiktok.video },
                        mimetype: "video/mp4",
                        caption: "DOWNLOADED BY SRI-BOT"
                    }, { quoted: mek });
                }
            }

            if (!downloadData?.data?.length) {
                return reply("No media found. Try a different link");
            }

            // Send media (up to 20 items)
            for (const media of downloadData.data.slice(0, 20)) {
                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(media.url) || media.type === 'video';
                
                await conn.sendMessage(mek.from, {
                    [isVideo ? 'video' : 'image']: { url: media.url },
                    mimetype: isVideo ? "video/mp4" : undefined,
                    caption: "DOWNLOADED BY SRI-BOT"
                }, { quoted: mek });
            }
        } catch (error) {
            console.error('TikTok download error:', error);
            reply("Failed to download. Please try another link");
        }
    } catch (error) {
        console.error('Command error:', error);
        reply("An error occurred. Please try again later");
    }
});
