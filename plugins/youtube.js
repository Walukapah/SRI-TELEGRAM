const config = require('../config');
const { cmd, commands } = require('../command');
const axios = require('axios');

cmd({
    pattern: "youtube",
    desc: "Download YouTube videos with thumbnail preview",
    category: "download",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        const text = m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
        const url = text.split(' ').slice(1).join(' ').trim();

        if (!url) return reply("Please provide a YouTube URL\nExample: .youtube https://youtu.be/xyz");

        if (!/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(url)) {
            return reply("Invalid YouTube URL. Please provide a valid link.");
        }

        await conn.sendMessage(from, { react: { text: '🔄', key: mek.key } });

        const apiUrl = `https://sri-api.vercel.app/download/youtubedl?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl);

        if (!data?.status || !data?.result?.data?.download_links?.items?.length) {
            return reply("Failed to get video data from API.");
        }

        const videoInfo = data.result.data.video_info;
        const stats = data.result.data.statistics;
        const author = data.result.data.author;
        const downloadLinks = data.result.data.download_links.items;

        const videoQualities = downloadLinks.filter(item => item.type === "Video");

        if (videoQualities.length === 0) {
            return reply("No video download links available for this video.");
        }

        const caption = `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
👀 *Views:* ${stats.views_formatted}
❤️ *Likes:* ${stats.likes_formatted}
💬 *Comments:* ${stats.comments_formatted}
⏱️ *Duration:* ${videoInfo.duration_formatted}

*Available Qualities:*
${videoQualities.map((item, index) => `${index + 1}. ${item.quality} (${item.resolution}) - ${item.size}`).join('\n')}

Select a quality by clicking below buttons or type "cancel" to abort.`;

        const buttons = videoQualities.map((item, index) => ({
            buttonId: `quality_${index}`,
            buttonText: { displayText: `${index + 1}. ${item.quality} (${item.resolution})` },
            type: 1
        }));

        buttons.push({
            buttonId: 'cancel',
            buttonText: { displayText: '❌ Cancel' },
            type: 1
        });

        await conn.sendMessage(from, {
            image: { url: videoInfo.imagePreviewUrl },
            caption: caption,
            footer: "Sri-Bot YouTube Downloader",
            buttons: buttons,
            headerType: 4,
        }, { quoted: mek });

        const collector = conn.ev.on('messages.upsert', async ({ messages }) => {
            const response = messages[0];
            if (!response?.message?.buttonsResponseMessage) return;
            if (response.key.remoteJid !== from) return;

            const buttonId = response.message.buttonsResponseMessage.selectedButtonId;

            if (buttonId === 'cancel') {
                await conn.sendMessage(from, { text: "Download cancelled." }, { quoted: response });
                conn.ev.off('messages.upsert', collector);
                return;
            }

            if (!buttonId.startsWith('quality_')) return;

            const selectedIndex = parseInt(buttonId.replace('quality_', ''));
            const selectedQuality = videoQualities[selectedIndex];

            if (!selectedQuality) {
                await conn.sendMessage(from, { text: "Invalid selection, please try again." }, { quoted: response });
                return;
            }

            conn.ev.off('messages.upsert', collector);

            await conn.sendMessage(from, {
                text: `⬇️ Downloading ${selectedQuality.quality} (${selectedQuality.resolution}) video...\nSize: ${selectedQuality.size}`
            }, { quoted: response });

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

        setTimeout(() => {
            conn.ev.off('messages.upsert', collector);
            conn.sendMessage(from, { text: "⏰ Selection timed out. Please try again." }, { quoted: mek });
        }, 120000);

    } catch (error) {
        console.error('YouTube download error:', error);
        reply("❌ Failed to download video. Try again later.");
    }
});
