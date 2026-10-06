const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('leveling')
  .setDescription('Configure this server’s XP leveling system.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommandGroup((group) => group
    .setName('settings')
    .setDescription('Enable or configure the XP leveling system.')
    .addSubcommand((subcommand) => subcommand
      .setName('enable')
      .setDescription('Enable XP for member messages.'))
    .addSubcommand((subcommand) => subcommand
      .setName('disable')
      .setDescription('Disable XP awards without deleting settings.'))
    .addSubcommand((subcommand) => subcommand
      .setName('view')
      .setDescription('View this server’s leveling settings.'))
    .addSubcommand((subcommand) => subcommand
      .setName('configure')
      .setDescription('Configure XP amounts and the message cooldown.')
      .addIntegerOption((option) => option
        .setName('minimum_xp')
        .setDescription('Minimum XP awarded per eligible message.')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('maximum_xp')
        .setDescription('Maximum XP awarded per eligible message.')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('cooldown_seconds')
        .setDescription('Seconds between XP awards to each member.')
        .setMinValue(1)
        .setMaxValue(3600)
        .setRequired(true))))
  .addSubcommandGroup((group) => group
    .setName('announcement')
    .setDescription('Configure where level-ups are announced.')
    .addSubcommand((subcommand) => subcommand
      .setName('set')
      .setDescription('Set the level-up announcement channel.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('The channel for level-up announcements.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('clear')
      .setDescription('Announce level-ups in the channel where the member earned them.')))
  .addSubcommandGroup((group) => group
    .setName('reward')
    .setDescription('Configure role rewards for reaching levels.')
    .addSubcommand((subcommand) => subcommand
      .setName('set')
      .setDescription('Set or replace the role reward for a level.')
      .addIntegerOption((option) => option
        .setName('level')
        .setDescription('The level required for this role.')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('The role to grant at this level.')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Remove a role reward for a level.')
      .addIntegerOption((option) => option
        .setName('level')
        .setDescription('The level reward to remove.')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('list')
      .setDescription('List configured level role rewards.')));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need the Manage Server permission to configure leveling.', flags: MessageFlags.Ephemeral });
  }

  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (group === 'settings' && subcommand === 'view') {
    const settings = database.getLevelingSettings(guildId);
    const announcement = settings.announcement_channel_id
      ? `<#${settings.announcement_channel_id}>`
      : 'the channel where the member earned the level';
    return interaction.reply({
      content: `Leveling is ${settings.enabled ? 'enabled' : 'disabled'}.\nXP per message: ${settings.xp_min}-${settings.xp_max}\nCooldown: ${settings.cooldown_seconds} seconds\nAnnouncements: ${announcement}\nRole rewards: ${settings.reward_roles.length}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (group === 'settings' && subcommand === 'configure') {
    const minimumXp = interaction.options.getInteger('minimum_xp', true);
    const maximumXp = interaction.options.getInteger('maximum_xp', true);
    if (minimumXp > maximumXp) {
      return interaction.reply({
        content: 'Minimum XP cannot be greater than maximum XP.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const cooldownSeconds = interaction.options.getInteger('cooldown_seconds', true);
    database.updateLevelingSettings(guildId, {
      xp_min: minimumXp,
      xp_max: maximumXp,
      cooldown_seconds: cooldownSeconds,
    });
    return interaction.reply({
      content: `Leveling configured: ${minimumXp}-${maximumXp} XP per message with a ${cooldownSeconds}-second cooldown.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (group === 'settings') {
    const enabled = subcommand === 'enable';
    database.updateLevelingSettings(guildId, { enabled });
    return interaction.reply({
      content: `Leveling has been ${enabled ? 'enabled' : 'disabled'}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (group === 'announcement') {
    if (subcommand === 'clear') {
      database.updateLevelingSettings(guildId, { announcement_channel_id: null });
      return interaction.reply({
        content: 'Level-ups will be announced in the channel where the member earned them.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const channel = interaction.options.getChannel('channel', true);
    const botMember = interaction.guild.members.me;
    const permissions = botMember && channel.permissionsFor(botMember);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return interaction.reply({
        content: 'I need View Channel and Send Messages permissions in that announcement channel.',
        flags: MessageFlags.Ephemeral,
      });
    }
    database.updateLevelingSettings(guildId, { announcement_channel_id: channel.id });
    return interaction.reply({
      content: `Level-ups will be announced in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (group === 'reward') {
    const settings = database.getLevelingSettings(guildId);
    if (subcommand === 'list') {
      if (!settings.reward_roles.length) {
        return interaction.reply({ content: 'No level role rewards are configured.', flags: MessageFlags.Ephemeral });
      }
      const rewards = settings.reward_roles.map((reward) => `Level ${reward.level}: <@&${reward.role_id}>`).join('\n');
      return interaction.reply({
        content: `${rewards.slice(0, 1900)}${rewards.length > 1900 ? '\n…and more.' : ''}`,
        allowedMentions: { parse: [] },
        flags: MessageFlags.Ephemeral,
      });
    }
    const level = interaction.options.getInteger('level', true);
    if (subcommand === 'remove') {
      const removed = database.removeLevelReward(guildId, level);
      return interaction.reply({
        content: removed ? `Removed the role reward for level ${level}.` : `No role reward is set for level ${level}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const role = interaction.options.getRole('role', true);
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: 'I need Manage Roles permission to grant level rewards.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (role.managed || role.comparePositionTo(botMember.roles.highest) >= 0) {
      return interaction.reply({
        content: 'Choose a role that is not managed and is below my highest role.',
        flags: MessageFlags.Ephemeral,
      });
    }
    database.setLevelReward(guildId, level, role.id);
    return interaction.reply({
      content: `Members reaching level ${level} will receive ${role}. The highest earned reward replaces lower reward roles.`,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: 'Unknown leveling configuration.',
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
