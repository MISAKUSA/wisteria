const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('autothread')
  .setDescription('Manage automatic threads for image posts in a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Start a thread when a member posts an image.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to configure; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('Check whether automatic image threads are enabled.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to check; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Turn off automatic image threads in a channel.')
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
    database.setAutoThread(channel.id, interaction.user.id);
    return interaction.reply({
      content: `Image posts in <#${channel.id}> will start a thread.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'view') {
    return interaction.reply({
      content: database.getAutoThread(channel.id)
        ? `Image posts in <#${channel.id}> start a thread.`
        : `Automatic image threads are not set in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = database.removeAutoThread(channel.id);
  return interaction.reply({
    content: removed
      ? `Automatic image threads are turned off in <#${channel.id}>.`
      : `Automatic image threads were not set in <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
