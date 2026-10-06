const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription('Manage the role automatically given to new members.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Replace the automatic roles for new members with one role.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role to assign to new members.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('add')
    .setDescription('Add a role to the automatic roles for new members.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The additional role to assign to new members.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove')
    .setDescription('Remove one role from the automatic roles.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The automatic role to remove.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View the automatic roles for new members.'))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Stop assigning automatic roles to new members.'));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: 'You need the Manage Server permission to configure the automatic role.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'view') {
    const roleIds = database.getAutoRoles(interaction.guildId);
    return interaction.reply({
      content: roleIds.length
        ? `New members will be given these roles:\n${roleIds.map((roleId) => `• <@&${roleId}>`).join('\n')}`
        : 'This server does not have any automatic roles configured.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (subcommand === 'clear') {
    const removed = database.removeAutoRole(interaction.guildId);
    return interaction.reply({
      content: removed
        ? 'All automatic roles have been cleared.'
        : 'This server does not have any automatic roles configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const role = interaction.options.getRole('role', true);
  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: 'I need the Manage Roles permission to assign automatic roles.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (role.guild.id !== interaction.guildId || !role.editable) {
    return interaction.reply({
      content: 'I cannot assign that role. Choose a role below my highest role.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'remove') {
    const removed = database.removeAutoRoleById(interaction.guildId, role.id);
    return interaction.reply({
      content: removed
        ? `Removed the ${role} role from the automatic roles.`
        : `The ${role} role is not in the automatic roles.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  if (subcommand === 'add') {
    const added = database.addAutoRole(interaction.guildId, role.id);
    return interaction.reply({
      content: added
        ? `Added the ${role} role to the automatic roles.`
        : `The ${role} role is already configured as an automatic role.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  database.setAutoRole(interaction.guildId, role.id);
  return interaction.reply({
    content: `Replaced the automatic roles. New members will be given the ${role} role.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function assignToNewMember(member, database) {
  const roleIds = database.getAutoRoles
    ? database.getAutoRoles(member.guild.id)
    : [database.getAutoRole(member.guild.id)].filter(Boolean);
  if (roleIds.length === 0) return false;

  const roles = await Promise.all(roleIds.map(async (roleId) => (
    member.guild.roles.cache.get(roleId) || member.guild.roles.fetch(roleId)
  )));
  const unavailableRoles = roleIds.filter((roleId, index) => !roles[index] || !roles[index].editable);
  if (unavailableRoles.length) {
    throw new Error(`Configured automatic roles are missing or cannot be managed: ${unavailableRoles.join(', ')}.`);
  }
  await member.roles.add(roles, 'Configured automatic roles for new members');
  return true;
}

module.exports = { data, execute, assignToNewMember };
