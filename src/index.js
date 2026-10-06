require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  MessageFlags,
  Partials,
  SlashCommandBuilder,
} = require('discord.js');
const database = require('./database');
const { handleMessageAutomations } = require('./message-automations');
const { handleButton, roleButtonPrefix } = require('./commands/rolebutton');
const confession = require('./commands/confession');
const autoRole = require('./commands/autorole');
const { getMediaLog, logEvent } = require('./logging');
const { processLevelingMessage } = require('./leveling');
const { handleStarboardReaction } = require('./starboard');

const { DISCORD_TOKEN: token, DISCORD_CLIENT_ID: clientId, DISCORD_GUILD_ID: guildId } = process.env;
if (!token || !clientId) {
  throw new Error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID before starting the bot.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
const commands = new Collection();
const moderation = require('./commands/moderation');
const moderationCommandNames = new Set(moderation.commands.map((command) => command.data.name));
const rest = new REST({ version: '10' }).setToken(token);
const commandDirectory = path.join(__dirname, 'commands');

for (const fileName of fs.readdirSync(commandDirectory).filter((name) => name.endsWith('.js'))) {
  const command = require(path.join(commandDirectory, fileName));
  if (command.commands) {
    for (const subcommand of command.commands) {
      commands.set(subcommand.data.name, subcommand);
    }
  } else {
    commands.set(command.data.name, command);
  }
}

const builtInCommandData = [...commands.values()].map((command) => command.data.toJSON());

async function syncGuildCommands(targetGuildId) {
  const guildCommands = database.listCustomCommands(targetGuildId).map((command) => new SlashCommandBuilder()
    .setName(command.name)
    .setDescription('Custom server response command.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON());
  const includeBuiltIns = guildId === targetGuildId;
  return rest.put(Routes.applicationGuildCommands(clientId, targetGuildId), {
    body: [...(includeBuiltIns ? builtInCommandData : []), ...guildCommands],
  });
}

client.once(Events.ClientReady, async (readyClient) => {
  try {
    if (guildId) {
      await syncGuildCommands(guildId);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: builtInCommandData });
    }

    for (const customGuildId of database.listCustomCommandGuildIds()) {
      if (customGuildId === guildId) continue;
      try {
        await syncGuildCommands(customGuildId);
      } catch (error) {
        console.error(`Could not sync custom commands for server ${customGuildId}:`, error);
      }
    }

    await moderation.restoreTemporaryActions(client, database);
    console.log(`Logged in as ${readyClient.user.tag}; synced ${commands.size} commands.`);
  } catch (error) {
    console.error('Could not register slash commands:', error);
    await client.destroy();
    process.exitCode = 1;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guild && (interaction.isChatInputCommand() || interaction.isButton())) {
    const details = interaction.isChatInputCommand()
      ? interaction.options.data.map((option) => `${option.name}: ${option.value ?? option.options?.map((nested) => `${nested.name}: ${nested.value}`).join(', ') ?? ''}`).join('\n')
      : `Button: ${interaction.customId}`;
    logEvent(
      interaction.guild,
      database,
      `Bot interaction: ${interaction.isChatInputCommand() ? `/${interaction.commandName}` : 'button'}`,
      `User: ${interaction.user.tag} (<@${interaction.user.id}>)\nChannel: <#${interaction.channelId}>\n${details}`,
    );
  }

  if (interaction.isButton() && interaction.customId.startsWith(roleButtonPrefix)) {
    try {
      await handleButton(interaction);
    } catch (error) {
      console.error('Role button interaction failed:', error);
      const response = {
        content: 'Something went wrong while updating your role.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(console.error);
      } else {
        await interaction.reply(response).catch(console.error);
      }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith(confession.confessionPrefix)) {
    try {
      await confession.handleButton(interaction, database);
    } catch (error) {
      console.error('Confession button interaction failed:', error);
      const response = {
        content: 'Something went wrong while opening that confession form.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(console.error);
      } else {
        await interaction.reply(response).catch(console.error);
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(`${confession.confessionPrefix}modal:`)) {
    try {
      await confession.handleModalSubmit(interaction, database);
    } catch (error) {
      console.error('Confession form submission failed:', error);
      const response = {
        content: 'Something went wrong while posting your anonymous submission.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(console.error);
      } else {
        await interaction.reply(response).catch(console.error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    const customCommand = interaction.guildId
      ? database.getCustomCommand(interaction.guildId, interaction.commandName)
      : undefined;
    if (!customCommand) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: 'You need the Manage Server permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      content: customCommand.response,
      allowedMentions: { parse: [] },
    });
  }

  try {
    await command.execute(interaction, database, {
      builtInCommandNames: new Set(commands.keys()),
      syncGuildCommands,
    });
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

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  if (message.channelId !== database.getLoggingChannel(message.guildId)) {
    const mediaLog = getMediaLog(message);
    if (mediaLog) {
      for (const event of mediaLog.events) {
        logEvent(message.guild, database, event.title, event.description, undefined, event.type);
      }
    }
  }

  try {
    await processLevelingMessage(message, database);
  } catch (error) {
    console.error(`Could not award leveling XP for member ${message.author.id} in server ${message.guildId}:`, error);
  }

  try {
    if (await moderation.handleHoneypotMessage(message, database)) return;
  } catch (error) {
    console.error(`Could not enforce honeypot in channel ${message.channelId}:`, error);
  }

  handleMessageAutomations(message, database);

  const autoReaction = database.getAutoReaction(message.channelId);
  if (autoReaction) {
    for (const emoji of autoReaction.emojis) {
      message.react(emoji).catch((error) => {
        console.error(`Could not add ${emoji} in channel ${message.channelId}:`, error);
      });
    }
  }

  const prefix = database.getPrefix(message.guildId);
  if (message.content.startsWith(prefix)) {
    const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (moderationCommandNames.has(commandName)) {
      try {
        await moderation.executePrefix(message, database, prefix, commandName, args.join(' '));
      } catch (error) {
        console.error(`Prefix moderation command ${prefix}${commandName} failed:`, error);
        await message.author.send('Something went wrong while running that moderation command.').catch((sendError) => {
          console.error(`Could not report failed prefix command to user ${message.author.id}:`, sendError);
        });
      }
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

client.on(Events.MessageReactionAdd, (reaction, user) => {
  handleStarboardReaction(reaction, user, database).catch((error) => {
    console.error(`Could not update the starboard for message ${reaction.message.id}:`, error);
  });
});

client.on(Events.MessageReactionRemove, (reaction, user) => {
  handleStarboardReaction(reaction, user, database).catch((error) => {
    console.error(`Could not update the starboard for message ${reaction.message.id}:`, error);
  });
});

client.on(Events.GuildMemberAdd, (member) => {
  logEvent(
    member.guild,
    database,
    'Member joined',
    `${member.user.tag} (<@${member.id}>)\nAccount created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
  );
  autoRole.assignToNewMember(member, database).catch((error) => {
    console.error(`Could not assign the automatic role to member ${member.id} in server ${member.guild.id}:`, error);
  });
  moderation.handleAntiRaidJoin(member, database).catch((error) => {
    console.error(`Could not process anti-raid join for server ${member.guild.id}:`, error);
  });
});

client.on(Events.GuildMemberRemove, (member) => {
  logEvent(member.guild, database, 'Member left', `${member.user.tag} (<@${member.id}>)`);
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) {
    changes.push(`Nickname: ${oldMember.nickname || oldMember.user.username} → ${newMember.nickname || newMember.user.username}`);
  }
  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    changes.push(`Timeout until: ${newMember.communicationDisabledUntilTimestamp
      ? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
      : 'removed'}`);
  }
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newRoles].filter((roleId) => !oldRoles.has(roleId));
  const removedRoles = [...oldRoles].filter((roleId) => !newRoles.has(roleId));
  if (addedRoles.length) changes.push(`Roles added: ${addedRoles.map((roleId) => `<@&${roleId}>`).join(', ')}`);
  if (removedRoles.length) changes.push(`Roles removed: ${removedRoles.map((roleId) => `<@&${roleId}>`).join(', ')}`);
  if (changes.length) {
    logEvent(newMember.guild, database, 'Member updated', `${newMember.user.tag} (<@${newMember.id}>)\n${changes.join('\n')}`);
  }
});

client.on(Events.MessageDelete, (message) => {
  if (!message.guild || !message.author || message.author.bot
    || message.channelId === database.getLoggingChannel(message.guildId)) return;
  logEvent(
    message.guild,
    database,
    'Message deleted',
    `Author: ${message.author.tag} (<@${message.author.id}>)\nChannel: <#${message.channelId}>\nContent: ${message.content || '(content unavailable)'}`,
    0xed4245,
  );
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  if (!newMessage.guild || !newMessage.author || newMessage.author.bot
    || newMessage.channelId === database.getLoggingChannel(newMessage.guildId)
    || oldMessage.content === newMessage.content) return;
  logEvent(
    newMessage.guild,
    database,
    'Message edited',
    `Author: ${newMessage.author.tag} (<@${newMessage.author.id}>)\nChannel: <#${newMessage.channelId}>\nBefore: ${oldMessage.content || '(content unavailable)'}\nAfter: ${newMessage.content || '(no text)'}`,
    0xfee75c,
  );
});

client.on(Events.MessageBulkDelete, (messages) => {
  const message = messages.find((entry) => entry.guild);
  if (!message || message.channelId === database.getLoggingChannel(message.guildId)) return;
  logEvent(message.guild, database, 'Messages bulk deleted', `${messages.size} messages were deleted in <#${message.channelId}>.`, 0xed4245);
});

client.on(Events.ChannelCreate, (channel) => {
  if (channel.guild) logEvent(channel.guild, database, 'Channel created', `${channel.name} (<#${channel.id}>)`);
});

client.on(Events.ChannelDelete, (channel) => {
  if (channel.guild) logEvent(channel.guild, database, 'Channel deleted', `${channel.name} (${channel.id})`, 0xed4245);
});

client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Name: ${oldChannel.name} → ${newChannel.name}`);
  if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
    changes.push(`Topic: ${oldChannel.topic || '(none)'} → ${newChannel.topic || '(none)'}`);
  }
  if ('nsfw' in oldChannel && 'nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
    changes.push(`NSFW: ${newChannel.nsfw}`);
  }
  if ('rateLimitPerUser' in oldChannel && 'rateLimitPerUser' in newChannel
    && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
    changes.push(`Slowmode: ${newChannel.rateLimitPerUser} seconds`);
  }
  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push(`Category: ${oldChannel.parentId ? `<#${oldChannel.parentId}>` : '(none)'} → ${newChannel.parentId ? `<#${newChannel.parentId}>` : '(none)'}`);
  }
  const oldOverwrites = oldChannel.permissionOverwrites?.cache;
  const newOverwrites = newChannel.permissionOverwrites?.cache;
  const serializeOverwrites = (overwrites) => [...overwrites.values()]
    .map((overwrite) => `${overwrite.id}:${overwrite.type}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`)
    .sort()
    .join('|');
  if (oldOverwrites && newOverwrites && serializeOverwrites(oldOverwrites) !== serializeOverwrites(newOverwrites)) {
    changes.push('Channel permission overwrites changed');
  }
  if (changes.length) logEvent(newChannel.guild, database, 'Channel updated', `${newChannel.name} (<#${newChannel.id}>)\n${changes.join('\n')}`);
});

client.on(Events.ThreadCreate, (thread, newlyCreated) => {
  if (newlyCreated && thread.guild) {
    logEvent(thread.guild, database, 'Thread created', `${thread.name} (<#${thread.id}>)\nParent: <#${thread.parentId}>`);
  }
});

client.on(Events.ThreadDelete, (thread) => {
  if (thread.guild) logEvent(thread.guild, database, 'Thread deleted', `${thread.name} (${thread.id})`, 0xed4245);
});

client.on(Events.ThreadUpdate, (oldThread, newThread) => {
  if (oldThread.name !== newThread.name && newThread.guild) {
    logEvent(newThread.guild, database, 'Thread updated', `Name: ${oldThread.name} → ${newThread.name}\nThread: <#${newThread.id}>`);
  }
});

client.on(Events.GuildRoleCreate, (role) => {
  logEvent(role.guild, database, 'Role created', `${role.name} (<@&${role.id}>)`);
});

client.on(Events.GuildRoleDelete, (role) => {
  logEvent(role.guild, database, 'Role deleted', `${role.name} (${role.id})`, 0xed4245);
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Name: ${oldRole.name} → ${newRole.name}`);
  if (oldRole.color !== newRole.color) changes.push('Color changed');
  if (oldRole.hoist !== newRole.hoist) changes.push(`Displayed separately: ${newRole.hoist}`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: ${newRole.mentionable}`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('Permissions changed');
  if (changes.length) logEvent(newRole.guild, database, 'Role updated', `${newRole.name} (<@&${newRole.id}>)\n${changes.join('\n')}`);
});

client.on(Events.GuildBanAdd, (ban) => {
  logEvent(ban.guild, database, 'Member banned', `${ban.user.tag} (<@${ban.user.id}>)\nReason: ${ban.reason || 'Not provided'}`, 0xed4245);
});

client.on(Events.GuildBanRemove, (ban) => {
  logEvent(ban.guild, database, 'Member unbanned', `${ban.user.tag} (<@${ban.user.id}>)`);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member) return;
  let event;
  let details;
  if (!oldState.channelId && newState.channelId) {
    event = 'Joined voice channel';
    details = `<#${newState.channelId}>`;
  } else if (oldState.channelId && !newState.channelId) {
    event = 'Left voice channel';
    details = `<#${oldState.channelId}>`;
  } else if (oldState.channelId !== newState.channelId) {
    event = 'Moved voice channels';
    details = `<#${oldState.channelId}> → <#${newState.channelId}>`;
  } else {
    const changes = [];
    if (oldState.serverMute !== newState.serverMute) changes.push(`Server muted: ${newState.serverMute}`);
    if (oldState.serverDeaf !== newState.serverDeaf) changes.push(`Server deafened: ${newState.serverDeaf}`);
    if (oldState.selfMute !== newState.selfMute) changes.push(`Self muted: ${newState.selfMute}`);
    if (oldState.selfDeaf !== newState.selfDeaf) changes.push(`Self deafened: ${newState.selfDeaf}`);
    if (!changes.length) return;
    event = 'Voice state updated';
    details = changes.join('\n');
  }
  logEvent(member.guild, database, event, `${member.user.tag} (<@${member.id}>)\n${details}`);
});

client.login(token).catch((error) => {
  console.error('Could not log in to Discord:', error);
  process.exitCode = 1;
});