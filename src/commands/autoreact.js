const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('autoreact')
  .setDescription('Set an automatic reaction for messages in a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Choose the emoji to add to new messages.')
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
    .setName('view')
    .setDescription('View the automatic reaction for a channel.')
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
    database.setAutoReaction(channel.id, emoji, interaction.user.id);
    return interaction.reply({
      content: `New messages in <#${channel.id}> will get ${emoji}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'view') {
    const setting = database.getAutoReaction(channel.id);
    return interaction.reply({
      content: setting
        ? `New messages in <#${channel.id}> get ${setting.emoji}.`
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