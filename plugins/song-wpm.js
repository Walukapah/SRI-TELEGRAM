const yts = require('yt-search');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "song",
    description: "Download songs or videos from YouTube",
    category: "media",
    usage: "song <name> or song <url>",
    
    async execute(client, message, args) {
        try {
            const query = args.join(' ');
            
            if (!query) {
                return message.reply('❗ කරුණාකර ගීතයේ හෝ වීඩියෝවේ නම හෝ YouTube URL එක ඇතුළත් කරන්න.');
            }

            // Check if input is a URL
            if (ytdl.validateURL(query)) {
                await downloadFromUrl(message, query);
            } else {
                await searchAndDownload(message, query);
            }
        } catch (error) {
            console.error('Error in song command:', error);
            message.reply('❌ දෝෂයක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.');
        }
    }
};

async function searchAndDownload(message, query) {
    try {
        message.reply('🔍 YouTube වෙත සෙවීම...');

        const searchResults = await yts(query);
        if (!searchResults.videos.length) {
            return message.reply('❌ සෙවුම් ප්‍රතිඵල හමු නොවීය.');
        }

        const video = searchResults.videos[0];
        const url = video.url;

        if (!ytdl.validateURL(url)) {
            return message.reply('❌ වලංගු නොවන YouTube URL එකක් හමුවිය.');
        }

        await downloadFromUrl(message, url, video.title);
    } catch (error) {
        console.error('Search error:', error);
        message.reply('❌ සෙවුමේ දෝෂයක් ඇතිවිය.');
    }
}

async function downloadFromUrl(message, url, title = '') {
    try {
        message.reply('⬇️ බාගැනෙමින්...');

        const videoInfo = await ytdl.getInfo(url);
        const actualTitle = title || videoInfo.videoDetails.title;
        const sanitizedTitle = actualTitle.replace(/[^\w\s]/gi, '');

        // Download as audio
        const audioStream = ytdl(url, { quality: 'highestaudio' });
        const filePath = path.join(__dirname, '..', 'temp', `${sanitizedTitle}.mp3`);

        audioStream.pipe(fs.createWriteStream(filePath))
            .on('finish', () => {
                message.reply({
                    audio: fs.readFileSync(filePath),
                    mimetype: 'audio/mp3',
                    filename: `${sanitizedTitle}.mp3`
                });
                
                // Clean up
                fs.unlinkSync(filePath);
            })
            .on('error', (err) => {
                console.error('Download error:', err);
                message.reply('❌ බාගැනීමේ දෝෂයක් ඇතිවිය.');
            });

    } catch (error) {
        console.error('Download from URL error:', error);
        message.reply('❌ වීඩියෝව බාගැනීමේ දෝෂයක් ඇතිවිය.');
    }
}
