const config = require('../config');
const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
    pattern: "youtube",
    desc: "Download YouTube videos with quality selection",
    category: "download",
    use: ".youtube <YouTube URL>",
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

        // Filter video and audio links
        const videoQualities = downloadLinks.filter(item => item.type === "Video");
        const audioQualities = downloadLinks.filter(item => item.type === "Audio");

        if (!videoQualities.length && !audioQualities.length) {
            return reply("No downloadable content found");
        }

        // Create selection menu
        let qualityOptions = "";
        let optionCounter = 1;
        
        // Video quality options
        if (videoQualities.length) {
            qualityOptions += "🎥 *Video Qualities:*\n";
            videoQualities.forEach((item, index) => {
                qualityOptions += `${optionCounter}. ${item.quality} (${item.resolution}) - ${item.size}\n`;
                optionCounter++;
            });
            qualityOptions += "\n";
        }

        // Audio quality options
        if (audioQualities.length) {
            qualityOptions += "🎵 *Audio Qualities:*\n";
            audioQualities.forEach((item, index) => {
                qualityOptions += `${optionCounter}. ${item.quality} - ${item.size}\n`;
                optionCounter++;
            });
        }

        const infoMsg = `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
👀 *Views:* ${stats.views_formatted}
❤️ *Likes:* ${stats.likes_formatted}
⏱️ *Duration:* ${videoInfo.duration_formatted}

${qualityOptions}
🔽 *Reply with the number of your choice*

${config.FOOTER || "POWERED BY SRI-BOT"}`;

        // Send info message with thumbnail
        const sentMsg = await conn.sendMessage(
            from, 
            { 
                image: { url: videoInfo.imagePreviewUrl }, 
                caption: infoMsg 
            }, 
            { quoted: mek }
        );

        const messageID = sentMsg.key.id;
        await conn.sendMessage(from, { react: { text: '🎬', key: sentMsg.key } });

        // Listen for user reply only once
        conn.ev.once('messages.upsert', async (messageUpdate) => {
            try {
                const mekInfo = messageUpdate?.messages[0];
                if (!mekInfo?.message) return;

                const messageType = mekInfo?.message?.conversation || mekInfo?.message?.extendedTextMessage?.text;
                const isReplyToSentMsg = mekInfo?.message?.extendedTextMessage?.contextInfo?.stanzaId === messageID;

                if (!isReplyToSentMsg) return;

                const userChoice = parseInt(messageType.trim());
                if (isNaN(userChoice) return reply("❌ Please reply with a number from the list");

                const allOptions = [...videoQualities, ...audioQualities];
                if (userChoice < 1 || userChoice > allOptions.length) {
                    return reply("❌ Invalid choice. Please select a number from the list");
                }

                const selectedItem = allOptions[userChoice - 1];
                await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

                // Create caption for the downloaded media
                const caption = `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
📊 *Quality:* ${selectedItem.quality}${selectedItem.resolution ? ` (${selectedItem.resolution})` : ''}
📦 *Size:* ${selectedItem.size}

${config.FOOTER || "POWERED BY SRI-BOT"}`;

                // Send the selected media
                if (selectedItem.type === "Video") {
                    await conn.sendMessage(
                        from,
                        {
                            video: { url: selectedItem.url },
                            mimetype: "video/mp4",
                            caption: caption,
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363165918432989@newsletter',
                                    newsletterName: 'SRI-BOT 🇱🇰',
                                    serverMessageId: -1
                                }
                            }
                        },
                        { quoted: mek }
                    );
                } else if (selectedItem.type === "Audio") {
                    await conn.sendMessage(
                        from,
                        {
                            audio: { url: selectedItem.url },
                            mimetype: "audio/mpeg",
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363165918432989@newsletter',
                                    newsletterName: 'SRI-BOT 🇱🇰',
                                    serverMessageId: -1
                                }
                            }
                        },
                        { quoted: mek }
                    );
                    await conn.sendMessage(
                        from,
                        { text: caption },
                        { quoted: mek }
                    );
                }

                await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

            } catch (error) {
                console.error('Quality selection error:', error);
                reply("Failed to process your selection. Please try again");
            }
        });

    } catch (error) {
        console.error('YouTube download error:', error);
        reply("Failed to download. Please try another link or try again later");
    }
});
