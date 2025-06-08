const config = require('../config');
const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
    pattern: "youtube",
    desc: "Download YouTube videos with thumbnail preview",
    category: "download",
    filename: __filename
},
async(conn, mek, m, { from, reply }) => {
    try {
        const text = m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
        const url = text.split(' ').slice(1).join(' ').trim();
        
        if (!url) return reply("Please provide a YouTube URL\nExample: .youtube https://youtu.be/xyz");

        // Validate YouTube URL
        if (!/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(url)) {
            return reply("Invalid YouTube URL. Please provide a valid link");
        }

        await conn.sendMessage(from, { react: { text: '🔄', key: mek.key } });

        const apiUrl = `https://sri-api.vercel.app/download/youtubedl?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl);

        // Check if response is valid
        if (!data?.status || !data?.result?.data?.download_links?.items?.length) {
            return reply("Failed to get video data from API response");
        }

        const videoInfo = data.result.data.video_info;
        const stats = data.result.data.statistics;
        const author = data.result.data.author;
        const downloadLinks = data.result.data.download_links.items;

        // Find SD quality video (480p)
        const sdVideo = downloadLinks.find(item => 
            item.type === "Video" && 
            item.quality === "SD" && 
            item.resolution.includes("480")
        );

        if (!sdVideo) {
            return reply("SD quality (480p) video not available. Try another link");
        }

        // Create detailed caption with thumbnail
        const caption = `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
👀 *Views:* ${stats.views_formatted}
❤️ *Likes:* ${stats.likes_formatted}
💬 *Comments:* ${stats.comments_formatted}
⏱️ *Duration:* ${videoInfo.duration_formatted}
📊 *Quality:* SD (${sdVideo.resolution})
📦 *Size:* ${sdVideo.size}

> Downloading video... Please wait`;

        // First send thumbnail image with caption
        await conn.sendMessage(from, {
            image: { url: videoInfo.imagePreviewUrl },
            caption: caption,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: config.NEWS_LETTER,
                    newsletterName: config.BOT_NAME,
                    serverMessageId: -1
                }
            }
        }, { quoted: mek });

        // Then send the video
        await conn.sendMessage(from, {
            video: { url: sdVideo.url },
            mimetype: "video/mp4",
            caption: "> Video downloaded by Sri-Bot",
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: config.NEWS_LETTER,
                    newsletterName: config.BOT_NAME,
                    serverMessageId: -1
                }
            }
        });

    } catch (error) {
        console.error('YouTube download error:', error);
        reply("Failed to download. Please try another link or try again later");
    }
});
