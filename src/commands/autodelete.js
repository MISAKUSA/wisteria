const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const maximumDelaySeconds = 604800;
const secondsPerUnit = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

function formatDelay(delaySeconds) {
  for (const [unit, seconds] of Object.entries(secondsPerUnit).reverse()) {
    if (delaySeconds % seconds === 0) {
      const amount = delaySeconds / seconds;
      return `${amount} ${unit.slice(0, -1)}${amount === 1 ? '' : 's'}`;
    }
  }
}

const data = new SlashCommandBuilder()
  .setName('autodelete')
  .setDescription('Manage automatic message deletion in a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Set how long messages remain in a channel.')
    .addIntegerOption((option) => option
      .setName('duration')
      .setDescription('How long to keep new messages (maximum total delay: 7 days).')
      .setMinValue(1)
      .setMaxValue(maximumDelaySeconds)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('unit')
      .setDescription('The duration unit.')
      .addChoices(
        { name: 'Seconds', value: 'seconds' },
        { name: 'Minutes', value: 'minutes' },
        { name: 'Hours', value: 'hours' },
      )
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to configure; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View the automatic deletion delay for a channel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to check; defaults to this channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Turn off automatic message deletion in a channel.')
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
    const duration = interaction.options.getInteger('duration', true);
    const unit = interaction.options.getString('unit', true);
    const delaySeconds = duration * secondsPerUnit[unit];
    if (!Number.isSafeInteger(delaySeconds) || delaySeconds > maximumDelaySeconds) {
      return interaction.reply({
        content: 'The maximum automatic deletion delay is 7 days.',
        flags: MessageFlags.Ephemeral,
      });
    }
    database.setAutoDelete(channel.id, delaySeconds, interaction.user.id);
    return interaction.reply({
      content: `New messages in <#${channel.id}> will be deleted after ${duration} ${unit}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'view') {
    const setting = database.getAutoDelete(channel.id);
    return interaction.reply({
      content: setting
        ? `New messages in <#${channel.id}> are deleted after ${formatDelay(setting.delay_seconds)}.`
        : `Automatic message deletion is not set in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = database.removeAutoDelete(channel.id);
  return interaction.reply({
    content: removed
      ? `Automatic message deletion is turned off in <#${channel.id}>.`
      : `Automatic message deletion was not set in <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
