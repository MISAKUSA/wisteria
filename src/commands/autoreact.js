const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const maximumEmojis = 5;

const data = new SlashCommandBuilder()
  .setName('autoreact')
  .setDescription('Manage automatic reactions for messages in a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Replace the channel reactions with one emoji.')
    .addStringOption((option) => option
      .setName('emoji')
      .setDescription('A standard or custom server emoji.')
      .setMaxLength(100)
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to configure; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('add')
    .setDescription('Add an emoji to the channel reactions.')
    .addStringOption((option) => option
      .setName('emoji')
      .setDescription('A standard or custom server emoji.')
      .setMaxLength(100)
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to configure; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove')
    .setDescription('Remove one emoji from channel reactions.')
    .addStringOption((option) => option
      .setName('emoji')
      .setDescription('The emoji to remove.')
      .setMaxLength(100)
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to configure; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View automatic reactions for a channel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to check; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Turn off automatic reactions in a channel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to clear; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need the Manage Server permission to use this command.', flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'set') {
    const emoji = interaction.options.getString('emoji', true);
    database.setAutoReactions(channel.id, [emoji], interaction.user.id);
    return interaction.reply({
      content: `New messages in <#${channel.id}> will get ${emoji}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'add') {
    const emoji = interaction.options.getString('emoji', true);
    const existing = database.getAutoReaction(channel.id)?.emojis || [];
    if (existing.includes(emoji)) {
      return interaction.reply({ content: `${emoji} is already configured for <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }
    if (existing.length >= maximumEmojis) {
      return interaction.reply({ content: `A channel can have up to ${maximumEmojis} automatic reactions.`, flags: MessageFlags.Ephemeral });
    }
    database.setAutoReactions(channel.id, [...existing, emoji], interaction.user.id);
    return interaction.reply({
      content: `Added ${emoji} to automatic reactions in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'remove') {
    const emoji = interaction.options.getString('emoji', true);
    const removed = database.removeAutoReaction(channel.id, emoji);
    return interaction.reply({
      content: removed
        ? `Removed ${emoji} from automatic reactions in <#${channel.id}>.`
        : `${emoji} is not configured for <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'view') {
    const setting = database.getAutoReaction(channel.id);
    return interaction.reply({
      content: setting
        ? `New messages in <#${channel.id}> get ${setting.emojis.join(' ')}.`
        : `Automatic reactions are not set in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = database.removeAutoReaction(channel.id);
  return interaction.reply({
    content: removed
      ? `Automatic reactions are turned off in <#${channel.id}>.`
      : `Automatic reactions were not set in <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };