const axios = require('axios');

module.exports = {
    name: 'tt',
    description: 'Download TikTok videos via API',
    async execute(client, message, args) {
        const url = args[0];
        
        if (!url) return client.sendMessage(message.key.remoteJid, {
            text: 'Usage: !tt <tiktok-url>'
        });

        try {
            // Use a TikTok API service
            const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
            
            const response = await axios.get(apiUrl);
            const videoData = response.data.data;
            
            // Download video without watermark
            const videoResponse = await axios.get(videoData.play, { responseType: 'stream' });
            
            await client.sendMessage(message.key.remoteJid, {
                video: videoResponse.data,
                mimetype: 'video/mp4',
                caption: videoData.title || 'TikTok Video'
            });
            
        } catch (error) {
            await client.sendMessage(message.key.remoteJid, {
                text: `Error: ${error.response?.data?.msg || error.message}`
            });
        }
    }
};
