const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('forumtopic')
  .setDescription('Create a new topic in a forum channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) => option
    .setName('forum')
    .setDescription('The forum channel to post in.')
    .addChannelTypes(ChannelType.GuildForum)
    .setRequired(true))
  .addStringOption((option) => option
    .setName('title')
    .setDescription('The title of the new topic.')
    .setMaxLength(100)
    .setRequired(true))
  .addStringOption((option) => option
    .setName('message')
    .setDescription('The opening message for the topic.')
    .setMaxLength(2000)
    .setRequired(true))
  .addAttachmentOption((option) => option
    .setName('image')
    .setDescription('An optional image to include with the topic.'));

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

  const forum = interaction.options.getChannel('forum', true);
  if (forum.type !== ChannelType.GuildForum || forum.guildId !== interaction.guildId) {
    return interaction.reply({
      content: 'Choose a forum channel from this server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const title = interaction.options.getString('title', true);
  const message = interaction.options.getString('message', true);
  const image = interaction.options.getAttachment('image');
  if (image && !image.contentType?.startsWith('image/')) {
    return interaction.reply({
      content: 'The attachment must be an image.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const thread = await forum.threads.create({
    name: title,
    message: {
      content: message,
      allowedMentions: { parse: [] },
      ...(image ? { files: [{ attachment: image.url, name: image.name }] } : {}),
    },
  });

  return interaction.reply({
    content: `Created your topic in <#${forum.id}>: ${thread.url}`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
