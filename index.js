const { 
    Client, 
    GatewayIntentBits, 
    Routes, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    ChannelType,
    ActivityType
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const OWNER_ID = process.env.DISCORD_OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
    console.error("❌ Missing environment variables!");
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Define application commands
const commands = [
    {
        name: 'send',
        description: 'Send a JSON-formatted message to a specific channel',
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
            {
                type: 7, 
                name: 'channel',
                description: 'The channel to send the message to',
                required: true,
                channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
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
        description: '👁️ [Owner Only] Update the bot\'s custom status and visibility presence',
        default_member_permissions: '0',
        options: [
            {
                type: 3, // String type
                name: 'visibility',
                description: 'Select bot visibility state',
                required: true,
                choices: [
                    { name: '🟢 Online', value: 'online' },
                    { name: '🌙 Idle', value: 'idle' },
                    { name: '🔴 Do Not Disturb', value: 'dnd' },
                    { name: '⚪ Invisible', value: 'invisible' }
                ]
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
        description: '📢 [Owner Only] Broadcast a JSON message globally (creates #js-broadcast if missing)',
        default_member_permissions: '0'
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

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
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
            const targetChannel = interaction.options.getChannel('channel');

            const modal = new ModalBuilder()
                .setCustomId(`send_modal_${targetChannel.id}`)
                .setTitle('Paste Message JSON');

            const jsonInput = new TextInputBuilder()
                .setCustomId('json_payload')
                .setLabel('JSON Payload (Content, Embeds, Components)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('{\n  "content": "Hello World!"\n}')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
            await interaction.showModal(modal);
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

        // EXECUTE: /status (Owner Only - Setup custom status modal)
        if (commandName === 'status') {
            const selectedVisibility = interaction.options.getString('visibility');

            const modal = new ModalBuilder()
                .setCustomId(`status_modal_${selectedVisibility}`)
                .setTitle('Set Custom Presence');

            const textInput = new TextInputBuilder()
                .setCustomId('status_text')
                .setLabel('Custom Activity Status Text')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Processing payloads... / Watching you')
                .setMaxLength(120)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            await interaction.showModal(modal);
        }

        // EXECUTE: /broadcast
        if (commandName === 'broadcast') {
            const modal = new ModalBuilder()
                .setCustomId('broadcast_modal')
                .setTitle('Global Broadcast JSON');

            const jsonInput = new TextInputBuilder()
                .setCustomId('json_payload')
                .setLabel('Broadcast JSON Payload')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('{\n  "embeds": [{\n    "title": "Global Update!"\n  }]\n}')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
            await interaction.showModal(modal);
        }

        // EXECUTE: /guilds
        if (commandName === 'guilds') {
            const guildList = client.guilds.cache.map(g => `• **${g.name}** (ID: ${g.id})`).join('\n');
            await interaction.reply({
                content: `🌐 **Connected Guilds (${client.guilds.cache.size}):**\n${guildList || 'None'}`,
                ephemeral: true
            });
        }
    }

    // Handle Modal Submissions
    if (interaction.isModalSubmit()) {
        // Handle /send Modal
        if (interaction.customId.startsWith('send_modal_')) {
            const targetChannelId = interaction.customId.replace('send_modal_', '');
            try {
                const targetChannel = await client.channels.fetch(targetChannelId);
                const messagePayload = JSON.parse(interaction.fields.getTextInputValue('json_payload'));
                
                await targetChannel.send(messagePayload);
                await interaction.reply({ content: `✅ Dispatched to ${targetChannel}!`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `❌ **Error:** \`${error.message}\``, ephemeral: true });
            }
        }

        // Handle /status Modal
        if (interaction.customId.startsWith('status_modal_')) {
            const targetVisibility = interaction.customId.replace('status_modal_', '');
            const customStatusText = interaction.fields.getTextInputValue('status_text');

            try {
                client.user.setPresence({
                    status: targetVisibility,
                    activities: [{
                        name: customStatusText,
                        type: ActivityType.Custom // Sets up a regular modern Discord custom text status
                    }]
                });

                await interaction.reply({ 
                    content: `⚙️ **Bot Presence Updated!**\n• **Visibility:** \`${targetVisibility}\`\n• **Status Text:** "${customStatusText}"`, 
                    ephemeral: true 
                });
            } catch (error) {
                await interaction.reply({ content: `❌ **Failed to update presence:** \`${error.message}\``, ephemeral: true });
            }
        }

        // Handle /broadcast Modal
        if (interaction.customId === 'broadcast_modal') {
            await interaction.deferReply({ ephemeral: true });
            
            let rawJson = interaction.fields.getTextInputValue('json_payload');
            let messagePayload;

            try {
                messagePayload = JSON.parse(rawJson);
            } catch (error) {
                return interaction.editReply({ content: `❌ **Invalid JSON Format:** \`${error.message}\`` });
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
                content: `📢 **Broadcast complete!**\n• **Sent successfully:** ${successCount} servers.\n• **Failed/Skipped (Missing Bot Permissions):** ${failCount} servers.`
            });
        }
    }
});

client.login(TOKEN);
