const ytdl = require('ytdl-core');
const fs = require('fs');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

async function youtubeDL(link, isAudio = false) {
    try {
        const info = await ytdl.getInfo(link);
        const format = isAudio 
            ? ytdl.chooseFormat(info.formats, { quality: 'highestaudio' })
            : ytdl.chooseFormat(info.formats, { quality: 'highest' });
        
        const stream = ytdl(link, { format });
        return { stream, info };
    } catch (error) {
        throw new Error(`YouTube download failed: ${error.message}`);
    }
}

// Baileys command handler
module.exports = {
    name: 'yt',
    description: 'Download YouTube videos or audio',
    async execute(client, message, args) {
        const url = args[0];
        if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
            return client.sendMessage(message.key.remoteJid, { text: 'Please provide a valid YouTube URL' });
        }

        const isAudio = args[1] === 'audio';
        try {
            const { stream, info } = await youtubeDL(url, isAudio);
            const fileName = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.${isAudio ? 'mp3' : 'mp4'}`;
            
            await client.sendMessage(message.key.remoteJid, { 
                text: `Downloading ${isAudio ? 'audio' : 'video'}...`
            });

            const tempFile = `./temp/${fileName}`;
            await pipeline(stream, fs.createWriteStream(tempFile));
            
            await client.sendMessage(message.key.remoteJid, {
                [isAudio ? 'audio' : 'video']: fs.readFileSync(tempFile),
                mimetype: isAudio ? 'audio/mpeg' : 'video/mp4',
                caption: info.videoDetails.title
            });
            
            fs.unlinkSync(tempFile);
        } catch (error) {
            await client.sendMessage(message.key.remoteJid, { 
                text: `Error: ${error.message}`
            });
        }
    }
};
