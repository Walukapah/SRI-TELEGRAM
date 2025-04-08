const { TikTokScraper } = require('tiktok-scraper');
const fs = require('fs');
const axios = require('axios');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

module.exports = {
    name: 'tiktok',
    description: 'Download TikTok videos without watermark',
    async execute(client, message, args) {
        const url = args[0];
        
        if (!url || !url.includes('tiktok.com')) {
            return client.sendMessage(message.key.remoteJid, { 
                text: 'Please send a valid TikTok URL\nExample: !tiktok https://vm.tiktok.com/xyz/'
            });
        }

        try {
            // Send processing message
            await client.sendMessage(message.key.remoteJid, {
                text: '⬇️ Downloading TikTok video... Please wait'
            });

            // Initialize scraper
            const scraper = new TikTokScraper();
            
            // Get video metadata
            const meta = await scraper.getVideoMeta(url);
            const videoUrl = meta.video_url;
            const username = meta.author?.unique_id || 'tiktok_user';
            const caption = meta.desc || 'TikTok Video';

            // Temporary file path
            const tempFile = `./temp/${Date.now()}_${username}.mp4`;

            // Download video
            const response = await axios({
                method: 'GET',
                url: videoUrl,
                responseType: 'stream'
            });

            await pipeline(response.data, fs.createWriteStream(tempFile));

            // Send video with caption
            await client.sendMessage(message.key.remoteJid, {
                video: fs.readFileSync(tempFile),
                mimetype: 'video/mp4',
                caption: caption.substring(0, 1024) // WhatsApp caption limit
            });

            // Clean up
            fs.unlinkSync(tempFile);
            
        } catch (error) {
            console.error('TikTok download error:', error);
            await client.sendMessage(message.key.remoteJid, {
                text: `❌ Failed to download TikTok video. Error: ${error.message}\n\nTry again or send a different URL.`
            });
            
            // Fallback method if primary fails
            try {
                await client.sendMessage(message.key.remoteJid, {
                    text: '⚠️ Trying alternative download method...'
                });
                
                const fallbackUrl = `https://tikcdn.io/ssstik/${url.split('/').pop()}`;
                const response = await axios.get(fallbackUrl, { responseType: 'stream' });
                
                await client.sendMessage(message.key.remoteJid, {
                    video: response.data,
                    mimetype: 'video/mp4',
                    caption: 'TikTok Video (alternative method)'
                });
            } catch (fallbackError) {
                await client.sendMessage(message.key.remoteJid, {
                    text: '❌ Both download methods failed. The TikTok may be private or restricted.'
                });
            }
        }
    }
};
