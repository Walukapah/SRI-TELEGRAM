const config = require('../config');
const { cmd, commands } = require('../command');
const axios = require('axios');

// Store user sessions for quality selection
const userSessions = {};

cmd({
    pattern: "youtube",
    desc: "Download YouTube videos or audio with quality selection",
    category: "download",
    filename: __filename
},
async(conn, mek, m, { from, reply, sender }) => {
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

        // Store available options in user session
        userSessions[sender] = {
            url: url,
            downloadLinks: downloadLinks,
            videoInfo: videoInfo,
            stats: stats,
            author: author,
            timestamp: Date.now()
        };

        // Create quality options message
        const videoQualities = downloadLinks.filter(item => item.type === "Video");
        const audioQualities = downloadLinks.filter(item => item.type === "Audio");

        let qualityOptions = "🎬 *Available Download Options:*\n\n";
        qualityOptions += `📺 *Video Qualities:*\n`;
        videoQualities.forEach((item, index) => {
            qualityOptions += `${index+1}. ${item.quality} (${item.resolution || 'N/A'}) - ${item.size}\n`;
        });

        qualityOptions += `\n🎵 *Audio Qualities:*\n`;
        audioQualities.forEach((item, index) => {
            qualityOptions += `${videoQualities.length + index + 1}. ${item.quality} - ${item.size}\n`;
        });

        qualityOptions += `\n*Reply with the number* of your preferred quality (e.g. *1* for ${videoQualities[0].quality})`;

        // Send thumbnail with quality options
        await conn.sendMessage(from, {
            image: { url: videoInfo.imagePreviewUrl },
            caption: `
🎬 *Title:* ${videoInfo.title}
👤 *Author:* ${author.name}
👀 *Views:* ${stats.views_formatted}
❤️ *Likes:* ${stats.likes_formatted}
⏱️ *Duration:* ${videoInfo.duration_formatted}

${qualityOptions}
            `,
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

    } catch (error) {
        console.error('YouTube download error:', error);
        reply("Failed to process your request. Please try again later");
    }
});

// Listen for user's quality selection
const handleReply = async (conn, mek, m, { from, reply, sender }) => {
    try {
        // Check if user has an active session
        if (!userSessions[sender] || (Date.now() - userSessions[sender].timestamp) > 300000) { // 5 minute timeout
            delete userSessions[sender];
            return;
        }

        const text = m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
        const selectedOption = parseInt(text.trim());

        if (isNaN(selectedOption) return;

        const session = userSessions[sender];
        const allOptions = [...session.downloadLinks.filter(item => item.type === "Video"), 
                          ...session.downloadLinks.filter(item => item.type === "Audio")];

        if (selectedOption < 1 || selectedOption > allOptions.length) {
            return reply("Invalid selection. Please reply with a valid number from the options.");
        }

        const selectedItem = allOptions[selectedOption - 1];

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

        // Prepare caption based on type
        const caption = selectedItem.type === "Video" 
            ? `🎬 *${session.videoInfo.title}*\n📊 *Quality:* ${selectedItem.quality} (${selectedItem.resolution})\n📦 *Size:* ${selectedItem.size}\n\n> Downloaded by ${config.BOT_NAME}`
            : `🎵 *${session.videoInfo.title}*\n🎧 *Quality:* ${selectedItem.quality}\n📦 *Size:* ${selectedItem.size}\n\n> Downloaded by ${config.BOT_NAME}`;

        // Send the selected media
        if (selectedItem.type === "Video") {
            await conn.sendMessage(from, {
                video: { url: selectedItem.url },
                mimetype: "video/mp4",
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
            });
        } else {
            await conn.sendMessage(from, {
                audio: { url: selectedItem.url },
                mimetype: "audio/mp4",
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
            });
        }

        // Clear the session
        delete userSessions[sender];

    } catch (error) {
        console.error('Quality selection error:', error);
        reply("Failed to process your selection. Please try again.");
    }
};

// Add reply handler to commands
commands.push({
    on: 'text',
    fromMe: false,
    onlyGroups: false,
    func: handleReply
});
