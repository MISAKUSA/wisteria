const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { loggingTypes } = require('../logging');

const data = new SlashCommandBuilder()
  .setName('logging')
  .setDescription('Configure this server’s bot event log channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Set the channel where bot events are logged.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel where events should be logged.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View the configured bot event log channel and status.'))
  .addSubcommand((subcommand) => subcommand
    .setName('types')
    .setDescription('View which types of events are included in the log.'))
  .addSubcommand((subcommand) => subcommand
    .setName('event')
    .setDescription('Enable or disable one type of event in the log.')
    .addStringOption((option) => option
      .setName('type')
      .setDescription('The event type to configure.')
      .addChoices(...loggingTypes)
      .setRequired(true))
    .addBooleanOption((option) => option
      .setName('enabled')
      .setDescription('Whether this event type should be logged.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('enable')
    .setDescription('Enable event logging for this server.'))
  .addSubcommand((subcommand) => subcommand
    .setName('disable')
    .setDescription('Pause event logging without removing the configured channel.'))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Stop logging bot events to a channel.'));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need the Manage Server permission to use this command.', flags: MessageFlags.Ephemeral });
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'set') {
    const channel = interaction.options.getChannel('channel', true);
    const botMember = interaction.guild.members.me;
    const botPermissions = botMember && channel.permissionsFor(botMember);
    if (!botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      return interaction.reply({
        content: 'I need View Channel, Send Messages, and Embed Links permissions in that channel to log events.',
        flags: MessageFlags.Ephemeral,
      });
    }
    database.setLoggingChannel(interaction.guildId, channel.id);
    return interaction.reply({
      content: `Bot events will be logged in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'view') {
    const channelId = database.getLoggingChannel(interaction.guildId);
    return interaction.reply({
      content: channelId
        ? `Bot event logging is ${database.isLoggingEnabled(interaction.guildId) ? 'enabled' : 'disabled'} for <#${channelId}>.`
        : 'This server does not have a bot event log channel configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'types') {
    const enabledTypes = database.getLoggingTypes(interaction.guildId);
    const status = loggingTypes.map(({ name, value }) => (
      `**${name}:** ${enabledTypes[value] === false ? 'Disabled' : 'Enabled'}`
    ));
    return interaction.reply({
      content: `Event types for ${database.getLoggingChannel(interaction.guildId)
        ? `<#${database.getLoggingChannel(interaction.guildId)}>`
        : 'the log channel'}:\n${status.join('\n')}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'event') {
    const type = interaction.options.getString('type', true);
    const enabled = interaction.options.getBoolean('enabled', true);
    database.setLoggingTypeEnabled(interaction.guildId, type, enabled);
    const label = loggingTypes.find((eventType) => eventType.value === type)?.name || type;
    return interaction.reply({
      content: `${label} logging has been ${enabled ? 'enabled' : 'disabled'}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'enable' || subcommand === 'disable') {
    if (!database.getLoggingChannel(interaction.guildId)) {
      return interaction.reply({
        content: 'Set a logging channel first with `/logging set`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const enabled = subcommand === 'enable';
    database.setLoggingEnabled(interaction.guildId, enabled);
    return interaction.reply({
      content: `Bot event logging has been ${enabled ? 'enabled' : 'disabled'}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = database.removeLoggingChannel(interaction.guildId);
  return interaction.reply({
    content: removed
      ? 'Bot event logging has been disabled.'
      : 'This server does not have a bot event log channel configured.',
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
