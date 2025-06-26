const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const config = require('../config');
const {cmd, commands} = require('../command');
const axios = require('axios');

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

        // Create interactive message with buttons
        const msg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `🎥 *YouTube Downloader*\n\n` +
                                `📌 *Title:* ${videoInfo.title || "Unknown"}\n` +
                                `⏳ *Duration:* ${videoInfo.duration_formatted || "Unknown"}\n` +
                                `👀 *Views:* ${stats.views_formatted || "Unknown"}\n` +
                                `👍 *Likes:* ${stats.likes_formatted || "Unknown"}\n` +
                                `👤 *Author:* ${author?.name || "Unknown"}`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: config.FOOTER || "POWERED BY YOUR BOT NAME"
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "Download Options",
                            subtitle: "Select quality",
                            hasMediaAttachment: true
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "Audio Options",
                                        sections: [{
                                            title: "Audio Quality",
                                            highlight_label: "🎵",
                                            rows: [
                                                {
                                                    title: "128kbps (High Quality)",
                                                    description: "Best audio quality",
                                                    id: "audio_128"
                                                },
                                                {
                                                    title: "48kbps (Low Quality)",
                                                    description: "Smaller file size",
                                                    id: "audio_48"
                                                }
                                            ]
                                        }]
                                    })
                                },
                                {
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "Video Options",
                                        sections: [{
                                            title: "Video Quality",
                                            highlight_label: "🎬",
                                            rows: [
                                                {
                                                    title: "1080p (FHD)",
                                                    description: "Full HD Quality",
                                                    id: "video_1080"
                                                },
                                                {
                                                    title: "720p (HD)",
                                                    description: "HD Quality",
                                                    id: "video_720"
                                                },
                                                {
                                                    title: "480p (SD)",
                                                    description: "Standard Quality",
                                                    id: "video_480"
                                                },
                                                {
                                                    title: "360p",
                                                    description: "Low Quality",
                                                    id: "video_360"
                                                }
                                            ]
                                        }]
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: m });

        await conn.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id });

        // Button response handler
        conn.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                const response = messageUpdate.messages[0];
                if (!response?.message?.interactiveResponseMessage) return;
                
                const buttonId = response.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
                const isResponseToThis = response.key.id === msg.key.id;
                
                if (!isResponseToThis) return;

                let downloadUrl;
                let type;
                let fileName = `${videoInfo.title}.${buttonId.startsWith('audio') ? 'm4a' : 'mp4'}`;
                
                const findItem = (type, quality) => 
                    downloadItems.find(item => item.type === type && item.quality === quality);

                switch(buttonId) {
                    // Audio options
                    case "audio_128":
                        const audio128k = findItem("Audio", "128K");
                        if (!audio128k) return await reply("❌ 128kbps audio not available!");
                        downloadUrl = audio128k.url;
                        type = { 
                            audio: {url: downloadUrl}, 
                            mimetype: "audio/mp4",
                            fileName: fileName
                        };
                        break;
                    case "audio_48":
                        const audio48k = findItem("Audio", "48K");
                        if (!audio48k) return await reply("❌ 48kbps audio not available!");
                        downloadUrl = audio48k.url;
                        type = { 
                            audio: {url: downloadUrl}, 
                            mimetype: "audio/mp4",
                            fileName: fileName
                        };
                        break;
                    
                    // Video options
                    case "video_1080":
                        const videoFHD = findItem("Video", "FHD");
                        if (!videoFHD) return await reply("❌ 1080p video not available!");
                        downloadUrl = videoFHD.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "video_720":
                        const videoHD = findItem("Video", "HD");
                        if (!videoHD) return await reply("❌ 720p video not available!");
                        downloadUrl = videoHD.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "video_480":
                        const videoSD = findItem("Video", "SD");
                        if (!videoSD) return await reply("❌ 480p video not available!");
                        downloadUrl = videoSD.url;
                        type = { 
                            video: {url: downloadUrl}, 
                            caption: videoInfo.title,
                            fileName: fileName
                        };
                        break;
                    case "video_360":
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

                const sendingMsg = await conn.sendMessage(from, {text: "⏳ Downloading..."}, {quoted: m});
                await conn.sendMessage(from, type, {quoted: m});
                await conn.sendMessage(from, {text: '✅ Download Successful ✅', edit: sendingMsg.key});

                // Remove the listener after processing
                conn.ev.off('messages.upsert', arguments.callee);
                
            } catch (error) {
                console.error(error);
                await reply(`❌ *An error occurred while processing:* ${error.message || "Error!"}`);
            }
        });

        // Set timeout to remove listener if no response
        setTimeout(() => {
            conn.ev.off('messages.upsert', arguments.callee);
        }, 60000); // 1 minute timeout

    } catch (error) {
        console.error(error);
        await reply(`❌ *An error occurred:* ${error.message || "Error!"}`);
    }
});
