const config = require('../config');
const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
    pattern: "youtube",
    desc: "Download YouTube videos with quality options",
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

        // Filter only video items (not audio)
        const videoQualities = downloadLinks.filter(item => item.type === "Video");

        if (videoQualities.length === 0) {
            return reply("No video download links available for this video");
        }

        // Create quality selection buttons
        const qualityButtons = videoQualities.map((item, index) => ({
            buttonId: `quality_${index}`,
            buttonText: { displayText: `${item.quality} (${item.resolution}) - ${item.size}` },
            type: 1
        }));

        // Add audio option if available
        const audioItem = downloadLinks.find(item => item.type === "Audio" && item.quality === "128K");
        if (audioItem) {
            qualityButtons.push({
                buttonId: 'audio_128k',
                buttonText: { displayText: `Audio (128K) - ${audioItem.size}` },
                type: 1
            });
        }

        // Create detailed caption
        const caption = `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
👀 *Views:* ${stats.views_formatted}
❤️ *Likes:* ${stats.likes_formatted}
💬 *Comments:* ${stats.comments_formatted}
⏱️ *Duration:* ${videoInfo.duration_formatted}

*Available Download Options:*`;

        // Send thumbnail with quality selection buttons
        await conn.sendMessage(from, {
            image: { url: videoInfo.imagePreviewUrl },
            caption: caption,
            footer: "Sri-Bot | Select a quality option",
            buttons: qualityButtons,
            headerType: 4,
        }, { quoted: mek });

        // Handle button responses
        conn.ev.on('messages.upsert', async({ messages }) => {
            const msg = messages[0];
            if (msg?.message?.buttonsResponseMessage?.selectedButtonId && 
                msg.key.remoteJid === from && 
                msg.key.fromMe === false) {
                
                const selectedId = msg.message.buttonsResponseMessage.selectedButtonId;
                let selectedItem;
                
                if (selectedId.startsWith('quality_')) {
                    const index = parseInt(selectedId.split('_')[1]);
                    selectedItem = videoQualities[index];
                } else if (selectedId === 'audio_128k' && audioItem) {
                    selectedItem = audioItem;
                }

                if (selectedItem) {
                    await conn.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
                    
                    const downloadMsg = `📥 Downloading ${selectedItem.type === "Video" ? 
                        `video (${selectedItem.resolution})` : 'audio (128K)'}...`;

                    await conn.sendMessage(from, { text: downloadMsg }, { quoted: msg });

                    try {
                        if (selectedItem.type === "Video") {
                            await conn.sendMessage(from, {
                                video: { url: selectedItem.url },
                                mimetype: "video/mp4",
                                caption: `📹 *${videoInfo.title}*\n🔄 *Quality:* ${selectedItem.quality} (${selectedItem.resolution})\n📦 *Size:* ${selectedItem.size}\n\n> Downloaded by Sri-Bot`,
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
                        } else {
                            await conn.sendMessage(from, {
                                audio: { url: selectedItem.url },
                                mimetype: "audio/mp4",
                                caption: `🎵 *${videoInfo.title}*\n🔄 *Quality:* ${selectedItem.quality}\n📦 *Size:* ${selectedItem.size}\n\n> Downloaded by Sri-Bot`,
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
                        }
                    } catch (error) {
                        console.error('Download error:', error);
                        await conn.sendMessage(from, { text: "Failed to download. Please try again later." }, { quoted: msg });
                    }
                }
            }
        });

    } catch (error) {
        console.error('YouTube download error:', error);
        reply("Failed to process. Please try another link or try again later");
    }
});
