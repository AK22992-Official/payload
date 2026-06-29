const { 
    Client, 
    GatewayIntentBits, 
    Routes, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    ChannelType,
    ActivityType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const OWNER_ID = process.env.DISCORD_OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
    console.error("❌ Missing environment variables! Check your Railway configuration.");
    process.exit(1);
}

// CRITICAL: Must include GuildMembers intent to detect user join/leave events
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const CONFIG_PATH = path.join(__dirname, 'config.json');
const WELCOME_PATH = path.join(__dirname, 'welcome.json');

// Helper to load settings locally
function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// Helper to process your specific layout syntax and swap {user}
function processWelcomePayload(member) {
    if (!fs.existsSync(WELCOME_PATH)) return null;
    let rawData = fs.readFileSync(WELCOME_PATH, 'utf8');
    
    // Globally replace the {user} placeholder with the joining member's precise mention format
    rawData = rawData.replace(/{user}/g, `<@${member.id}>`);
    return JSON.parse(rawData);
}

const commands = [
    {
        name: 'send',
        description: '💬 [Owner Only] Send a JSON payload using a modal popup box',
        default_member_permissions: '0',
        options: [
            {
                type: 7, 
                name: 'channel',
                description: 'Target channel (Optional: Defaults to current channel)',
                required: false,
                channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
            }
        ]
    },
    {
        name: 'filesend',
        description: '📁 [Owner Only] Send a massive JSON structure via a file attachment upload',
        default_member_permissions: '0',
        options: [
            {
                type: 11, 
                name: 'file',
                description: 'Upload the .txt or .json file payload',
                required: true
            },
            {
                type: 7, 
                name: 'channel',
                description: 'Target channel (Optional: Defaults to current channel)',
                required: false,
                channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
            }
        ]
    },
    {
        name: 'say',
        description: '🗣️ [Owner Only] Make the bot send a regular plain-text message',
        default_member_permissions: '0',
        options: [
            {
                type: 3, 
                name: 'message',
                description: 'Type your message content here',
                required: true
            },
            {
                type: 7, 
                name: 'channel',
                description: 'Target channel (Optional: Defaults to current channel)',
                required: false,
                channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
            }
        ]
    },
    {
        name: 'welcome',
        description: '⚙️ [Owner Only] Set the target welcome/leave channel and fire a layout test',
        default_member_permissions: '0',
        options: [
            {
                type: 7,
                name: 'channel',
                description: 'The channel where automated welcomes & leaves should be routed',
                required: true,
                channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
            }
        ]
    },
    {
        name: 'status',
        description: '👁️ [Owner Only] Update the bot\'s custom status text and visibility',
        default_member_permissions: '0',
        options: [
            {
                type: 3, 
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
                type: 3, 
                name: 'text',
                description: 'Type the custom activity text status',
                required: true
            }
        ]
    }
];

client.once('ready', async () => {
    console.log(`🤖 Private server bot active as ${client.user.tag}!`);
    try {
        await client.rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Successfully synced application commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

// Helper to download text from file attachments
async function downloadFileContent(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download file from Discord.');
    return await response.text();
}

// ==========================================
// 🚀 AUTOMATIC WELCOME EVENT TRIGGER
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const config = loadConfig();
    const targetChannelId = config[member.guild.id];
    
    if (!targetChannelId) return;

    try {
        const channel = await client.channels.fetch(targetChannelId);
        const welcomePayload = processWelcomePayload(member);

        if (welcomePayload) {
            await channel.send(welcomePayload);
        }
    } catch (error) {
        console.error(`❌ Automated welcome dispatch failed:`, error.message);
    }
});

// ==========================================
// 🍂 AUTOMATIC LEAVE EVENT TRIGGER
// ==========================================
client.on('guildMemberRemove', async (member) => {
    const config = loadConfig();
    const targetChannelId = config[member.guild.id];
    
    if (!targetChannelId) return;

    try {
        const channel = await client.channels.fetch(targetChannelId);
        // Sends a clean, plain-text mention stating they left the server
        await channel.send({ content: `😭 <@${member.id}> left the server.` });
    } catch (error) {
        console.error(`❌ Automated leave notification failed:`, error.message);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

    // --- OWNER SECURITY CHECK ---
    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Access Denied: System belongs to system owner.', ephemeral: true });
    }

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // EXECUTE: /send
        if (commandName === 'send') {
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

            const modal = new ModalBuilder()
                .setCustomId(`send_modal_${targetChannel.id}`)
                .setTitle('Paste Message JSON');

            const jsonInput = new TextInputBuilder()
                .setCustomId('json_payload')
                .setLabel('JSON Payload Structure')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('{\n  "content": "Hello World!"\n}')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
            await interaction.showModal(modal);
        }

        // EXECUTE: /filesend
        if (commandName === 'filesend') {
            await interaction.deferReply({ ephemeral: true });
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const fileAttachment = interaction.options.getAttachment('file');

            try {
                const rawText = await downloadFileContent(fileAttachment.url);
                const messagePayload = JSON.parse(rawText);
                
                await targetChannel.send(messagePayload);
                await interaction.editReply({ content: `✅ Payload successfully dispatched to ${targetChannel}!` });
            } catch (error) {
                await interaction.editReply({ content: `❌ **Failed to send file build:** \`${error.message}\`.` });
            }
        }

        // EXECUTE: /say
        if (commandName === 'say') {
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const textContent = interaction.options.getString('message');

            try {
                await targetChannel.send({ content: textContent });
                await interaction.reply({ content: `✅ Plain message dropped in ${targetChannel}!`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `❌ **Failed to dispatch plain text:** \`${error.message}\``, ephemeral: true });
            }
        }

        // EXECUTE: /welcome
        if (commandName === 'welcome') {
            await interaction.deferReply({ ephemeral: true });
            const targetChannel = interaction.options.getChannel('channel');
            
            // Save configuration state locally
            const config = loadConfig();
            config[interaction.guild.id] = targetChannel.id;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

            // Generate test execution run
            const testPayload = processWelcomePayload(interaction.member);
            if (!testPayload) {
                return await interaction.editReply({ 
                    content: `⚙️ **Welcome/Leave channel configured to ${targetChannel}!**\n⚠️ *Note: Create a \`welcome.json\` file in your root folder on GitHub if you want the automated joining feature to work.*`
                });
            }

            try {
                await targetChannel.send(testPayload);
                await interaction.editReply({ content: `⚙️ **Welcome configurations updated!**\n✅ A test profile of your layout has been fired directly into ${targetChannel}.\n👋 Leaves will now also drop a text log here.` });
            } catch (error) {
                await interaction.editReply({ content: `⚙️ Channel saved, but layout failed to render: \`${error.message}\`` });
            }
        }

        // EXECUTE: /status
        if (commandName === 'status') {
            const visibility = interaction.options.getString('visibility');
            const text = interaction.options.getString('text');

            try {
                client.user.setPresence({
                    status: visibility,
                    activities: [{ name: text, type: ActivityType.Custom }]
                });
                await interaction.reply({ 
                    content: `⚙️ **Bot Presence Updated!**\n• Visibility: \`${visibility}\`\n• Status: "${text}"`, 
                    ephemeral: true 
                });
            } catch (error) {
                await interaction.reply({ content: `❌ **Presence Sync Error:** \`${error.message}\``, ephemeral: true });
            }
        }
    }

    // Modal Capture processing
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('send_modal_')) {
            const targetChannelId = interaction.customId.replace('send_modal_', '');
            try {
                const targetChannel = await client.channels.fetch(targetChannelId);
                const messagePayload = JSON.parse(interaction.fields.getTextInputValue('json_payload'));
                
                await targetChannel.send(messagePayload);
                await interaction.reply({ content: `✅ Modal payload dispatched to ${targetChannel}!`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: `❌ **Modal JSON Syntax Error:** \`${error.message}\``, ephemeral: true });
            }
        }
    }
});

client.login(TOKEN);
