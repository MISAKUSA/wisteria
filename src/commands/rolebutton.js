const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const roleButtonPrefix = 'self-role:';

const data = new SlashCommandBuilder()
  .setName('rolebutton')
  .setDescription('Post a button members can use to toggle a role.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addRoleOption((option) => option
    .setName('role')
    .setDescription('The role members can add or remove.')
    .setRequired(true))
  .addStringOption((option) => option
    .setName('label')
    .setDescription('The text shown on the button.')
    .setMaxLength(80))
  .addStringOption((option) => option
    .setName('message')
    .setDescription('Optional text to show above the button.')
    .setMaxLength(2000));

async function execute(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: 'You need the Manage Server permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const role = interaction.options.getRole('role', true);
  const botMember = interaction.guild.members.me;
  if (!botMember) {
    return interaction.reply({
      content: 'I could not check my role permissions. Please try again shortly.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: 'I need the Manage Roles permission to create a role button.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (role.guild.id !== interaction.guildId || !role.editable) {
    return interaction.reply({
      content: 'I cannot manage that role. Choose a role below my highest role.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const label = interaction.options.getString('label') || role.name;
  const message = interaction.options.getString('message');
  const button = new ButtonBuilder()
    .setCustomId(`${roleButtonPrefix}${role.id}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);

  const postedMessage = await interaction.channel.send({
    ...(message ? { content: message, allowedMentions: { parse: [] } } : {}),
    components: [new ActionRowBuilder().addComponents(button)],
  });

  return interaction.reply({
    content: `Role button posted: ${postedMessage.url}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleButton(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'This button can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const roleId = interaction.customId.slice(roleButtonPrefix.length);
  const role = interaction.guild.roles.cache.get(roleId);
  const member = interaction.member;
  if (!role || role.guild.id !== interaction.guildId || !role.editable) {
    return interaction.reply({
      content: 'That role is no longer available.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const alreadyHasRole = member.roles.cache.has(role.id);
  if (alreadyHasRole) {
    await member.roles.remove(role);
    return interaction.reply({
      content: `Removed the ${role.name} role.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await member.roles.add(role);
  return interaction.reply({
    content: `Added the ${role.name} role.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute, handleButton, roleButtonPrefix };
