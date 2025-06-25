const config = require('../config');
const {cmd , commands} = require('../command');
const axios = require('axios');

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
}, async (conn, m, mek, { from, q, reply }) => {
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

        let info = `🎥 *𝚈𝙾𝚄𝚃𝚄𝙱𝙴 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁* 🎥\n\n` +
            `📌 *Title:* ${videoInfo.title || "Unknown"}\n` +
            `⏳ *Duration:* ${videoInfo.duration_formatted || "Unknown"}\n` +
            `👀 *Views:* ${stats.views_formatted || "Unknown"}\n` +
            `👍 *Likes:* ${stats.likes_formatted || "Unknown"}\n` +
            `👤 *Author:* ${author?.name || "Unknown"}\n` +
            `🔗 *Url:* ${videoInfo.original_url || "Unknown"}\n\n` +
            `🔽 *Reply with your choice:*\n` +
            `1️⃣.1️⃣ *Audio (128kbps)* 🎵\n` +
            `1️⃣.2️⃣ *Audio (48kbps)* 🎵\n` +
            `2️⃣.1️⃣ *Video (FHD 1080p)* 📹\n` +
            `2️⃣.2️⃣ *Video (HD 720p)* 📹\n` +
            `2️⃣.3️⃣ *Video (SD 480p)* 📹\n\n` +
            `${config.FOOTER || "POWERED BY YOUR BOT NAME"}`;

        const sentMsg = await conn.sendMessage(from, { 
            image: { url: videoInfo.imagePreviewUrl }, 
            caption: info 
        }, { quoted: mek });
        
        const messageID = sentMsg.key.id;
        await conn.sendMessage(from, { react: { text: '🎬', key: sentMsg.key } });

        // Listen for user reply
        const replyHandler = async (messageUpdate) => {
            try {
                const mekInfo = messageUpdate?.messages[0];
                if (!mekInfo?.message) return;

                const messageType = mekInfo?.message?.conversation || mekInfo?.message?.extendedTextMessage?.text;
                const isReplyToSentMsg = mekInfo?.message?.extendedTextMessage?.contextInfo?.stanzaId === messageID;

                if (!isReplyToSentMsg) return;

                let userReply = messageType.trim();
                let msg;
                let type;
                let downloadUrl;
                let fileName = `${videoInfo.title}.${userReply.startsWith('1') ? 'm4a' : 'mp4'}`;
                
                // Remove the listener after first response
                conn.ev.off('messages.upsert', replyHandler);

                const audio128k = data.result.data.download_links.items.find(item => item.type === "Audio" && item.quality === "128K");
                const audio48k = data.result.data.download_links.items.find(item => item.type === "Audio" && item.quality === "48K");
                const videoFHD = data.result.data.download_links.items.find(item => item.type === "Video" && item.quality === "FHD");
                const videoHD = data.result.data.download_links.items.find(item => item.type === "Video" && item.quality === "HD");
                const videoSD = data.result.data.download_links.items.find(item => item.type === "Video" && item.quality === "SD");

                switch(userReply) {
                    case "1.1":
                        if (!audio128k) return await reply("❌ 128kbps audio not available!");
                        downloadUrl = audio128k.url;
                        type = { 
                            audio: { url: downloadUrl }, 
                            mimetype: "audio/mp4",
                            fileName: fileName
                        };
                        break;
                    case "1.2":
                        if (!audio48k) return await reply("❌ 48kbps audio not available!");
                        downloadUrl = audio48k.url;
                        type = { 
                            audio: { url: downloadUrl }, 
                            mimetype: "audio/mp4",
                            fileName: fileName
                        };
                        break;
                    case "2.1":
                        if (!videoFHD) return await reply("❌ FHD video not available!");
                        downloadUrl = videoFHD.url;
                        type = { 
                            video: { url: downloadUrl }, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "2.2":
                        if (!videoHD) return await reply("❌ HD video not available!");
                        downloadUrl = videoHD.url;
                        type = { 
                            video: { url: downloadUrl }, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "2.3":
                        if (!videoSD) return await reply("❌ SD video not available!");
                        downloadUrl = videoSD.url;
                        type = { 
                            video: { url: downloadUrl }, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    default:
                        return await reply("❌ Invalid choice! Please reply with one of the provided options.");
                }

                msg = await conn.sendMessage(from, { text: "⏳ Downloading..." }, { quoted: mek });
                await conn.sendMessage(from, type, { quoted: mek });
                await conn.sendMessage(from, { text: '✅ Download Successful ✅', edit: msg.key });

            } catch (error) {
                console.error(error);
                await reply(`❌ *An error occurred while processing:* ${error.message || "Error!"}`);
            }
        };

        conn.ev.on('messages.upsert', replyHandler);

        // Set timeout to remove listener if no response
        setTimeout(() => {
            conn.ev.off('messages.upsert', replyHandler);
        }, 60000); // 1 minute timeout

    } catch (error) {
        console.error(error);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
        await reply(`❌ *An error occurred:* ${error.message || "Error!"}`);
    }
});
