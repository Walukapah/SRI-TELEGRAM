const config = require('../config');
const {cmd, commands} = require('../command');
const axios = require('axios');
const { delay } = require('@whiskeysockets/baileys');

// Helper functions remain the same
function replaceYouTubeID(url) {
    const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function searchYoutube(query) {
    try {
        const response = await axios.get(`https://sri-api.vercel.app/download/youtubedl?url=${encodeURIComponent(query)}`);
        return response.data;
    } catch (error) {
        console.error('YouTube search error:', error);
        return null;
    }
}

cmd({
    pattern: "youtube",
    alias: ["yt", "ytdl"],
    react: "🎥",
    desc: "Download YouTube videos or audio",
    category: "download",
    use: ".youtube <Text or YT URL>",
    filename: __filename
}, async (conn, m, mek, {from, q, reply}) => {
    try {
        if (!q) return await reply("❌ Please provide a Query or YouTube URL!");

        let id = q.startsWith("https://") ? replaceYouTubeID(q) : null;

        if (!id) {
            const searchResults = await searchYoutube(q);
            if (!searchResults?.result?.data?.video_info?.id) return await reply("❌ No results found!");
            id = searchResults.result.data.video_info.id;
        }

        const data = await searchYoutube(`https://youtube.com/watch?v=${id}`);
        if (!data?.result?.data) return await reply("❌ Failed to fetch video!");

        const videoInfo = data.result.data.video_info;
        const stats = data.result.data.statistics;
        const author = data.result.data.author;
        const downloadItems = data.result.data.download_links.items;

        // Create message with buttons (simpler approach to avoid timeout issues)
        const buttons = [
            {buttonId: 'yt_audio_128', buttonText: {displayText: '🎵 128kbps'}, type: 1},
            {buttonId: 'yt_audio_48', buttonText: {displayText: '🎵 48kbps'}, type: 1},
            {buttonId: 'yt_video_1080', buttonText: {displayText: '📹 1080p'}, type: 1},
            {buttonId: 'yt_video_720', buttonText: {displayText: '📹 720p'}, type: 1},
            {buttonId: 'yt_video_480', buttonText: {displayText: '📹 480p'}, type: 1},
            {buttonId: 'yt_video_360', buttonText: {displayText: '📹 360p'}, type: 1}
        ];

        const buttonMessage = {
            image: {url: videoInfo.imagePreviewUrl},
            caption: `🎥 *YouTube Downloader*\n\n` +
                `📌 *Title:* ${videoInfo.title || "Unknown"}\n` +
                `⏳ *Duration:* ${videoInfo.duration_formatted || "Unknown"}\n` +
                `👀 *Views:* ${stats.views_formatted || "Unknown"}\n` +
                `👍 *Likes:* ${stats.likes_formatted || "Unknown"}\n` +
                `👤 *Author:* ${author?.name || "Unknown"}\n\n` +
                `🔗 *URL:* ${videoInfo.original_url || "Unknown"}\n\n` +
                `🔽 *Select download option:*`,
            footer: config.FOOTER || "POWERED BY YOUR BOT",
            buttons: buttons,
            headerType: 4
        };

        // Send message with retry mechanism
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                await conn.sendMessage(from, buttonMessage, {quoted: m});
                break;
            } catch (error) {
                attempts++;
                if (attempts >= maxAttempts) {
                    console.error('Failed after retries:', error);
                    return await reply("❌ Failed to send options. Please try again later.");
                }
                await delay(1000 * attempts); // Wait longer between retries
            }
        }

        // Button response handler with timeout
        const responseHandler = async (messageUpdate) => {
            try {
                const response = messageUpdate.messages[0];
                if (!response?.message?.buttonsResponseMessage) return;
                
                const buttonId = response.message.buttonsResponseMessage.selectedButtonId;
                const isResponseToThis = response.key.remoteJid === from && 
                                       response.key.fromMe === false &&
                                       response.key.id === m.key.id;
                
                if (!isResponseToThis) return;

                let downloadUrl;
                let type;
                let fileName = `${videoInfo.title}.${buttonId.includes('audio') ? 'm4a' : 'mp4'}`;
                
                const findItem = (type, quality) => 
                    downloadItems.find(item => item.type === type && item.quality === quality);

                switch(buttonId) {
                    case "yt_audio_128":
                        const audio128k = findItem("Audio", "128K");
                        if (!audio128k) return await reply("❌ 128kbps audio not available!");
                        downloadUrl = audio128k.url;
                        type = { 
                            audio: {url: downloadUrl}, 
                            mimetype: "audio/mp4",
                            fileName: fileName
                        };
                        break;
                    case "yt_audio_48":
                        const audio48k = findItem("Audio", "48K");
                        if (!audio48k) return await reply("❌ 48kbps audio not available!");
                        downloadUrl = audio48k.url;
                        type = { 
                            audio: {url: downloadUrl}, 
                            mimetype: "audio/mp4",
                            fileName: fileName
                        };
                        break;
                    case "yt_video_1080":
                        const videoFHD = findItem("Video", "FHD");
                        if (!videoFHD) return await reply("❌ 1080p video not available!");
                        downloadUrl = videoFHD.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "yt_video_720":
                        const videoHD = findItem("Video", "HD");
                        if (!videoHD) return await reply("❌ 720p video not available!");
                        downloadUrl = videoHD.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "yt_video_480":
                        const videoSD = findItem("Video", "SD");
                        if (!videoSD) return await reply("❌ 480p video not available!");
                        downloadUrl = videoSD.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "yt_video_360":
                        const video360p = findItem("Video", "SD");
                        if (!video360p) return await reply("❌ 360p video not available!");
                        downloadUrl = video360p.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    default:
                        return;
                }

                const msg = await reply("⏳ Downloading...");
                try {
                    await conn.sendMessage(from, type, {quoted: m});
                    await conn.sendMessage(from, {text: '✅ Download Successful ✅', edit: msg.key});
                } catch (error) {
                    console.error('Download error:', error);
                    await conn.sendMessage(from, {text: '❌ Download Failed!', edit: msg.key});
                }

                // Remove the listener after processing
                conn.ev.off('messages.upsert', responseHandler);
                
            } catch (error) {
                console.error('Button handler error:', error);
                conn.ev.off('messages.upsert', responseHandler);
            }
        };

        conn.ev.on('messages.upsert', responseHandler);

        // Set timeout to remove listener if no response
        setTimeout(() => {
            conn.ev.off('messages.upsert', responseHandler);
        }, 60000); // 1 minute timeout

    } catch (error) {
        console.error('Command error:', error);
        await reply(`❌ *An error occurred:* ${error.message || "Error!"}`);
    }
});
