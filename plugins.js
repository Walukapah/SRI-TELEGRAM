const plugins = require('./plugins');

// In your message handler
for (const plugin of Object.values(plugins)) {
    if (message.body.startsWith(`!${plugin.name}`)) {
        return plugin.execute(client, message, message.body.split(' '));
    }
}
