const { 
    Client, 
    GatewayIntentBits, 
    Routes, 
    PermissionFlagsBits, 
    ChannelType,
    ActivityType
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const OWNER_ID = process.env.DISCORD_OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
    console.error("❌ Missing environment variables! Check Railway dashboard config.");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Define application commands with Attachment options
const commands = [
    {
        name: 'send',
        description: 'Send a JSON/TXT file payload as a formatted message',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
            {
                type: 7, // Channel Type
                name: 'channel',
                description: 'The channel to send the message to',
                required: true,
                channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
            },
            {
                type: 11, // ATTACHMENT Type
                name: 'file',
                description: 'Upload the .txt or .json file containing your payload',
                required: true
            }
        ]
    },
    {
        name: 'setup-broadcast',
        description: '🛠️ Manually pre-create the private #js-broadcast channel',
        default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
        name: 'status',
        description: '👁️ [Owner Only] Update the bot\'s custom status text and visibility',
        default_member_permissions: '0',
        options: [
            {
                type: 3, // String
                name: 'visibility',
                description: 'Select bot visibility state',
                required: true,
                choices: [
                    { name: '🟢 Online', value: 'online' },
                    { name: '🌙 Idle', value: 'idle' },
                    { name: '🔴 Do Not Disturb', value: 'dnd' },
                    { name: '⚪ Invisible', value: 'invisible' }
                ]
            },
            {
                type: 3, // String
                name: 'text',
                description: 'Type the custom activity text status',
                required: true
            }
        ]
    },
    {
        name: 'guilds',
        description: '👁️ [Owner Only] List all servers this bot is currently in',
        default_member_permissions: '0'
    },
    {
        name: 'broadcast',
        description: '📢 [Owner Only] Broadcast a JSON/TXT file payload globally',
        default_member_permissions: '0',
        options: [
            {
                type: 11, // ATTACHMENT Type
                name: 'file',
                description: 'Upload the .txt or .json file containing the broadcast payload',
                required: true
            }
        ]
    }
];

client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    try {
        await client.rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

// Helper function to handle the safe creation of the private channel
async function getOrCreateBroadcastChannel(guild) {
    let targetChannel = guild.channels.cache.find(
        ch => ch.name === 'js-broadcast' && ch.type === ChannelType.GuildText
    );

    if (!targetChannel) {
        targetChannel = await guild.channels.create({
            name: 'js-broadcast',
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel], 
                },
                {
                    id: client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], 
                }
            ]
        });
    }
    return targetChannel;
}

// Helper to download file content from Discord CDN url
async function downloadFileContent(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download file from Discord.');
    return await response.text();
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- OWNER ONLY COMMANDS GUARD ---
    if (['status', 'guilds', 'broadcast'].includes(commandName)) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ 
                content: '❌ This command is strictly locked to the bot owner.', 
                ephemeral: true 
            });
        }
    }

    // EXECUTE: /send
    if (commandName === 'send') {
        await interaction.deferReply({ ephemeral: true });
        const targetChannel = interaction.options.getChannel('channel');
        const fileAttachment = interaction.options.getAttachment('file');

        try {
            const rawText = await downloadFileContent(fileAttachment.url);
            const messagePayload = JSON.parse(rawText);
            
            await targetChannel.send(messagePayload);
            await interaction.editReply({ content: `✅ Payload successfully dispatched to ${targetChannel}!` });
        } catch (error) {
            await interaction.editReply({ content: `❌ **Failed to send:** \`${error.message}\`. Ensure your uploaded file is perfectly formatted JSON.` });
        }
    }

    // EXECUTE: /setup-broadcast
    if (commandName === 'setup-broadcast') {
        await interaction.deferReply({ ephemeral: true });

        const existingChannel = interaction.guild.channels.cache.find(
            ch => ch.name === 'js-broadcast' && ch.type === ChannelType.GuildText
        );

        if (existingChannel) {
            return interaction.editReply({ content: `⚠️ A channel named ${existingChannel} already exists!` });
        }

        try {
            const newChannel = await getOrCreateBroadcastChannel(interaction.guild);
            await interaction.editReply({ content: `✅ Successfully created private channel: ${newChannel}.` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Failed to create channel. Verify bot has **Manage Channels** permission.` });
        }
    }

    // EXECUTE: /status
    if (commandName === 'status') {
        const visibility = interaction.options.getString('visibility');
        const text = interaction.options.getString('text');

        try {
            client.user.setPresence({
                status: visibility,
                activities: [{
                    name: text,
                    type: ActivityType.Custom
                }]
            });

            await interaction.reply({ 
                content: `⚙️ **Bot Presence Updated!**\n• **Visibility:** \`${visibility}\`\n• **Status Text:** "${text}"`, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ content: `❌ **Failed to update presence:** \`${error.message}\``, ephemeral: true });
        }
    }

    // EXECUTE: /broadcast
    if (commandName === 'broadcast') {
        await interaction.deferReply({ ephemeral: true });
        const fileAttachment = interaction.options.getAttachment('file');
        
        let messagePayload;
        try {
            const rawText = await downloadFileContent(fileAttachment.url);
            messagePayload = JSON.parse(rawText);
        } catch (error) {
            return interaction.editReply({ content: `❌ **Invalid File/JSON Format:** \`${error.message}\`` });
        }

        const guilds = client.guilds.cache.values();
        let successCount = 0;
        let failCount = 0;

        for (const guild of guilds) {
            try {
                const targetChannel = await getOrCreateBroadcastChannel(guild);

                if (targetChannel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) {
                    await targetChannel.send(messagePayload);
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                console.error(`Failed auto-creation or transmission logic on guild: ${guild.name}.`, err.message);
                failCount++;
            }
        }

        await interaction.editReply({
            content: `📢 **Broadcast complete!**\n• **Sent successfully:** ${successCount} servers.\n• **Failed/Skipped:** ${failCount} servers.`
        });
    }

    // EXECUTE: /guilds
    if (commandName === 'guilds') {
        const guildList = client.guilds.cache.map(g => `• **${g.name}** (ID: ${g.id})`).join('\n');
        await interaction.reply({
            content: `🌐 **Connected Guilds (${client.guilds.cache.size}):**\n${guildList || 'None'}`,
            ephemeral: true
        });
    }
});

client.login(TOKEN);
