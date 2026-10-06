const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('randomsend')
  .setDescription('Send a message with an image to a random channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option
    .setName('message')
    .setDescription('The message to send.')
    .setMaxLength(2000)
    .setRequired(true))
  .addAttachmentOption((option) => option
    .setName('image')
    .setDescription('The image to include.')
    .setRequired(true));

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

  const image = interaction.options.getAttachment('image', true);
  if (!image.contentType?.startsWith('image/')) {
    return interaction.reply({
      content: 'The attachment must be an image.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const botMember = interaction.guild.members.me;
  if (!botMember) {
    return interaction.reply({
      content: 'I could not check my channel permissions. Please try again shortly.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const eligibleChannels = [...interaction.guild.channels.cache.values()].filter((channel) => (
    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    && channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
    ])
  ));

  if (eligibleChannels.length === 0) {
    return interaction.reply({
      content: 'There are no text channels where I can send messages with attachments.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = eligibleChannels[Math.floor(Math.random() * eligibleChannels.length)];
  const message = interaction.options.getString('message', true);
  await channel.send({
    content: message,
    files: [{ attachment: image.url, name: image.name }],
    allowedMentions: { parse: [] },
  });

  return interaction.reply({
    content: `Sent your message with an image to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { data, execute };
