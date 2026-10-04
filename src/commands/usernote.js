const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('usernote')
  .setDescription('Manage private staff notes about a server member.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand
    .setName('add')
    .setDescription('Add a private note about a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member the note is about.')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('note')
      .setDescription('The note visible to server managers.')
      .setMaxLength(1000)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('List private notes about a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member whose notes to view.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove')
    .setDescription('Remove a note by its ID.')
    .addIntegerOption((option) => option
      .setName('note_id')
      .setDescription('The ID shown by /usernote list.')
      .setMinValue(1)
      .setRequired(true)));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need the Manage Server permission to use this command.', flags: MessageFlags.Ephemeral });
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'add') {
    const user = interaction.options.getUser('user', true);
    const note = interaction.options.getString('note', true);
    const noteId = database.addNote(interaction.guildId, user.id, interaction.user.id, note);
    return interaction.reply({
      content: `Note #${noteId} added for ${user.tag}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'list') {
    const user = interaction.options.getUser('user', true);
    const notes = database.listNotes(interaction.guildId, user.id);
    if (notes.length === 0) {
      return interaction.reply({ content: `No notes found for ${user.tag}.`, flags: MessageFlags.Ephemeral });
    }

    const lines = notes.map((note) => `**#${note.id}** by <@${note.author_id}> (${note.created_at}): ${note.note}`);
    let response = `Notes for ${user.tag}:\n${lines.join('\n')}`;
    if (response.length > 1950) {
      response = `${response.slice(0, 1947)}...`;
    }
    return interaction.reply({ content: response, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  }

  const noteId = interaction.options.getInteger('note_id', true);
  const removed = database.removeNote(noteId, interaction.guildId);
  return interaction.reply({
    content: removed ? `Note #${noteId} removed.` : `No note #${noteId} was found in this server.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };