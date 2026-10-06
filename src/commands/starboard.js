const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const defaultThreshold = 3;

const data = new SlashCommandBuilder()
  .setName('starboard')
  .setDescription('Configure this server’s starboard.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Set the starboard channel and reaction threshold.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel where starred messages should be posted.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('threshold')
      .setDescription('The number of ⭐ reactions required (defaults to 3).')
      .setMinValue(1)
      .setMaxValue(100)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View this server’s starboard settings.'))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Disable this server’s starboard.'));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: 'You need the Manage Server permission to configure the starboard.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'view') {
    const settings = database.getStarboard(interaction.guildId);
    return interaction.reply({
      content: settings
        ? `The starboard is enabled in <#${settings.channel_id}> and requires ${settings.threshold} ⭐ reactions.`
        : 'This server does not have a starboard configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'clear') {
    const removed = database.removeStarboard(interaction.guildId);
    return interaction.reply({
      content: removed
        ? 'The starboard has been disabled. Existing starboard posts will remain in the channel.'
        : 'This server does not have a starboard configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = interaction.options.getChannel('channel', true);
  const botMember = interaction.guild.members.me;
  const botPermissions = botMember && channel.permissionsFor(botMember);
  if (!botPermissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
  ])) {
    return interaction.reply({
      content: 'I need View Channel, Send Messages, Embed Links, and Read Message History permissions in the starboard channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const threshold = interaction.options.getInteger('threshold') || defaultThreshold;
  database.setStarboard(interaction.guildId, channel.id, threshold, interaction.user.id);
  return interaction.reply({
    content: `The starboard is set to <#${channel.id}>. Messages need ${threshold} ⭐ reactions to appear.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
