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

        // Filter available video qualities
        const videoQualities = downloadLinks.filter(item => item.type === "Video");
        
        if (videoQualities.length === 0) {
            return reply("No video download links available for this video");
        }

        // Create detailed caption
        const caption = `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
👀 *Views:* ${stats.views_formatted}
❤️ *Likes:* ${stats.likes_formatted}
💬 *Comments:* ${stats.comments_formatted}
⏱️ *Duration:* ${videoInfo.duration_formatted}

*Available Qualities:*
${videoQualities.map((item, index) => 
    `${index+1}. ${item.quality} (${item.resolution}) - ${item.size}`
).join('\n')}

Reply with the number of the quality you want to download (1-${videoQualities.length}) or type "cancel" to abort.`;

        // First try to send as button message
        try {
            // Create quality selection buttons
            const buttons = [];
            videoQualities.forEach((item, index) => {
                buttons.push({
                    buttonId: `quality_${index}`,
                    buttonText: { displayText: `${index+1}. ${item.quality} (${item.resolution})` },
                    type: 1
                });
            });

            // Add cancel button
            buttons.push({
                buttonId: 'cancel',
                buttonText: { displayText: '❌ Cancel' },
                type: 1
            });

            await conn.sendMessage(from, {
                image: { url: videoInfo.imagePreviewUrl },
                caption: caption,
                footer: "Select a quality to download",
                buttons: buttons,
                headerType: 4,
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

            // Set timeout for button response (2 minutes)
            setTimeout(() => {
                conn.sendMessage(from, { text: "Quality selection timed out. Please try again." }, { quoted: mek });
            }, 120000);
        } catch (buttonError) {
            console.error('Button message failed, falling back to text:', buttonError);
            // If buttons fail, send as regular message
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

            // Listen for text response instead
            const filter = (m) => !m.key.fromMe && m.key.remoteJid === from;
            const collector = conn.ev.on('messages.upsert', async ({ messages }) => {
                const response = messages[0];
                const text = response?.message?.conversation || '';
                
                if (text.toLowerCase() === 'cancel') {
                    await conn.sendMessage(from, { text: "Download cancelled" }, { quoted: mek });
                    conn.ev.off('messages.upsert', collector);
                    return;
                }
                
                const selectedNum = parseInt(text);
                if (isNaN(selectedNum) || selectedNum < 1 || selectedNum > videoQualities.length) {
                    await conn.sendMessage(from, { text: `Please reply with a number between 1 and ${videoQualities.length} or "cancel"` }, { quoted: mek });
                    return;
                }
                
                const selectedQuality = videoQualities[selectedNum-1];
                
                // Remove listener
                conn.ev.off('messages.upsert', collector);
                
                // Send downloading message
                await conn.sendMessage(from, { 
                    text: `⬇️ Downloading ${selectedQuality.quality} (${selectedQuality.resolution}) video...\nSize: ${selectedQuality.size}` 
                }, { quoted: mek });
                
                // Send the video
                await conn.sendMessage(from, {
                    video: { url: selectedQuality.url },
                    mimetype: "video/mp4",
                    caption: `🎥 *${videoInfo.title}*\nQuality: ${selectedQuality.quality} (${selectedQuality.resolution})\nSize: ${selectedQuality.size}\n\nDownloaded by Sri-Bot`,
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
            });

            // Set timeout for text response (2 minutes)
            setTimeout(() => {
                conn.ev.off('messages.upsert', collector);
                conn.sendMessage(from, { text: "Quality selection timed out. Please try again." }, { quoted: mek });
            }, 120000);
        }

    } catch (error) {
        console.error('YouTube download error:', error);
        reply("Failed to download. Please try another link or try again later");
    }
});
