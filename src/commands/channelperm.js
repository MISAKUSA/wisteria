const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const channelTypes = [
  ChannelType.GuildCategory,
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
];

const nsfwChannelTypes = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
];

const data = new SlashCommandBuilder()
  .setName('channelperm')
  .setDescription('Manage role access and NSFW settings for channels.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((subcommand) => subcommand
    .setName('access')
    .setDescription('Allow, deny, or inherit a role’s channel visibility.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel or category to configure.')
      .addChannelTypes(...channelTypes)
      .setRequired(true))
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role whose access to configure.')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('mode')
      .setDescription('Whether this role can view the channel.')
      .addChoices(
        { name: 'Allow', value: 'allow' },
        { name: 'Deny', value: 'deny' },
        { name: 'Inherit', value: 'inherit' },
      )
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('nsfw')
    .setDescription('Turn the NSFW setting on or off for a channel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The text, announcement, forum, or media channel to configure.')
      .addChannelTypes(...nsfwChannelTypes)
      .setRequired(true))
    .addBooleanOption((option) => option
      .setName('enabled')
      .setDescription('Whether the channel is age-restricted.')
      .setRequired(true)));

async function execute(interaction) {
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (!interaction.inGuild()) {
    return reply('This command can only be used in a server.');
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return reply('You need the Manage Channels permission to use this command.');
  }

  const subcommand = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel('channel', true);
  if (channel.guildId !== interaction.guildId) {
    return reply('Choose a channel or category from this server.');
  }

  const botMember = interaction.guild.members.me;
  if (!botMember) {
    return reply('I could not check my permissions. Please try again shortly.');
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return reply('I need the Manage Channels permission to configure this channel.');
  }

  if (subcommand === 'nsfw') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await channel.setNSFW(enabled, `NSFW setting changed by ${interaction.user.tag}`);
    return reply(`${channel.name} is now ${enabled ? 'marked NSFW' : 'no longer marked NSFW'}.`);
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
    return reply('You also need the Manage Roles permission to change channel access.');
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return reply('I also need the Manage Roles permission to change channel access.');
  }

  const role = interaction.options.getRole('role', true);
  if (role.guild.id !== interaction.guildId || !role.editable) {
    return reply('I cannot manage that role. Choose a role below my highest role.');
  }
  const mode = interaction.options.getString('mode', true);
  const viewChannel = mode === 'allow' ? true : mode === 'deny' ? false : null;
  await channel.permissionOverwrites.edit(
    role,
    { ViewChannel: viewChannel },
    { reason: `Channel access changed by ${interaction.user.tag}` },
  );
  return reply(
    mode === 'inherit'
      ? `${role.name} now inherits view access in ${channel.name}.`
      : `${role.name} can ${mode === 'allow' ? 'now' : 'no longer'} view ${channel.name}.`,
  );
}

module.exports = { data, execute };
