const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('customcommand')
  .setDescription('Create and manage custom text commands for this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('create')
    .setDescription('Create or update a custom slash command.')
    .addStringOption((option) => option
      .setName('name')
      .setDescription('Command name, using lowercase letters, numbers, - or _.')
      .setMinLength(1)
      .setMaxLength(32)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('text')
      .setDescription('The text the command will send.')
      .setMaxLength(2000)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('List this server’s custom commands.'))
  .addSubcommand((subcommand) => subcommand
    .setName('delete')
    .setDescription('Delete a custom slash command.')
    .addStringOption((option) => option
      .setName('name')
      .setDescription('The name of the command to delete.')
      .setMinLength(1)
      .setMaxLength(32)
      .setRequired(true)));

async function execute(interaction, database, { builtInCommandNames, syncGuildCommands }) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'Custom commands can only be managed in a server.', flags: MessageFlags.Ephemeral });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need the Manage Server permission to use this command.', flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'list') {
    const customCommands = database.listCustomCommands(guildId);
    if (customCommands.length === 0) {
      return interaction.reply({ content: 'This server has no custom commands yet.', flags: MessageFlags.Ephemeral });
    }
    const names = customCommands.map((command) => `/${command.name}`).join(', ');
    return interaction.reply({
      content: `Custom commands: ${names.slice(0, 1850)}${names.length > 1850 ? '...' : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const name = interaction.options.getString('name', true);
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
    return interaction.reply({
      content: 'Use 1-32 lowercase letters, numbers, hyphens, or underscores for the name.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (builtInCommandNames.has(name)) {
    return interaction.reply({ content: `/${name} is already used by a built-in command.`, flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const previous = database.getCustomCommand(guildId, name);

  if (subcommand === 'create') {
    const text = interaction.options.getString('text', true);
    database.setCustomCommand(guildId, name, text, interaction.user.id);
    try {
      await syncGuildCommands(guildId);
    } catch (error) {
      if (previous) {
        database.setCustomCommand(guildId, name, previous.response, previous.created_by);
      } else {
        database.removeCustomCommand(guildId, name);
      }
      console.error('Could not register the custom slash command:', error);
      return interaction.editReply('Discord could not register that command. Please try again.');
    }
    return interaction.editReply(`/${name} is ready. Use it to post your custom text.`);
  }

  const removed = database.removeCustomCommand(guildId, name);
  if (!removed) return interaction.editReply(`/${name} is not a custom command in this server.`);

  try {
    await syncGuildCommands(guildId);
  } catch (error) {
    database.setCustomCommand(guildId, name, removed.response, removed.created_by);
    console.error('Could not remove the custom slash command:', error);
    return interaction.editReply('Discord could not remove that command. Please try again.');
  }
  return interaction.editReply(`/${name} was deleted.`);
}

module.exports = { data, execute };