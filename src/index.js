require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  MessageFlags,
} = require('discord.js');
const database = require('./database');

const { DISCORD_TOKEN: token, DISCORD_CLIENT_ID: clientId, DISCORD_GUILD_ID: guildId } = process.env;
if (!token || !clientId) {
  throw new Error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID before starting the bot.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
const commands = new Collection();
const commandDirectory = path.join(__dirname, 'commands');

for (const fileName of fs.readdirSync(commandDirectory).filter((name) => name.endsWith('.js'))) {
  const command = require(path.join(commandDirectory, fileName));
  commands.set(command.data.name, command);
}

client.once(Events.ClientReady, async (readyClient) => {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  try {
    await rest.put(route, { body: [...commands.values()].map((command) => command.data.toJSON()) });
    console.log(`Logged in as ${readyClient.user.tag}; synced ${commands.size} commands.`);
  } catch (error) {
    console.error('Could not register slash commands:', error);
    await client.destroy();
    process.exitCode = 1;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, database);
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const response = {
      content: 'Something went wrong while running that command.',
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(console.error);
    } else {
      await interaction.reply(response).catch(console.error);
    }
  }
});

const refreshesByChannel = new Map();

async function refreshSticky(channel) {
  const sticky = database.getSticky(channel.id);
  if (!sticky) return;

  if (sticky.message_id) {
    await channel.messages.delete(sticky.message_id).catch((error) => {
      if (error.code !== 10008) console.error('Could not remove the previous sticky message:', error);
    });
  }

  const message = await channel.send(sticky.content, { allowedMentions: { parse: [] } });
  database.updateStickyMessage(channel.id, message.id);
}

client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;

  const autoReaction = database.getAutoReaction(message.channelId);
  if (autoReaction) {
    for (const emoji of autoReaction.emojis) {
      message.react(emoji).catch((error) => {
        console.error(`Could not add ${emoji} in channel ${message.channelId}:`, error);
      });
    }
  }

  if (!database.getSticky(message.channelId)) return;

  const channelId = message.channelId;
  const previousRefresh = refreshesByChannel.get(channelId) || Promise.resolve();
  const refresh = previousRefresh
    .then(() => refreshSticky(message.channel))
    .catch((error) => console.error(`Could not refresh sticky in channel ${channelId}:`, error))
    .finally(() => {
      if (refreshesByChannel.get(channelId) === refresh) refreshesByChannel.delete(channelId);
    });
  refreshesByChannel.set(channelId, refresh);
});

client.login(token).catch((error) => {
  console.error('Could not log in to Discord:', error);
  process.exitCode = 1;
});