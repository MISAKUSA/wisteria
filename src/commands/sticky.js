const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Manage the sticky message in a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Set or replace a channel sticky message.')
    .addStringOption((option) => option
      .setName('message')
      .setDescription('The message to keep at the bottom of the channel.')
      .setMaxLength(2000)
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to use; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View a channel sticky message.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to check; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove')
    .setDescription('Remove a channel sticky message.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to clear; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));

async function deleteStickyMessage(channel, messageId) {
  if (!messageId) return;
  await channel.messages.delete(messageId).catch((error) => {
    if (error.code !== 10008) throw error;
  });
}

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
    const content = interaction.options.getString('message', true);
    const existing = database.getSticky(channel.id);
    await deleteStickyMessage(channel, existing?.message_id);
    const stickyMessage = await channel.send(content, { allowedMentions: { parse: [] } });
    database.setSticky(channel.id, stickyMessage.id, content, interaction.user.id);
    return interaction.reply({
      content: `Sticky message set in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const existing = database.getSticky(channel.id);
  if (subcommand === 'view') {
    if (!existing) {
      return interaction.reply({ content: `There is no sticky message in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setTitle(`Sticky message in #${channel.name}`)
      .setDescription(existing.content);
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (!existing) {
    return interaction.reply({ content: `There is no sticky message in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
  }
  await deleteStickyMessage(channel, existing.message_id);
  database.removeSticky(channel.id);
  return interaction.reply({ content: `Sticky message removed from <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };