const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require('discord.js');
const { logEvent: defaultLogEvent } = require('../logging');

const confessionPrefix = 'confession:';
const maximumPollAnswers = 10;

const data = new SlashCommandBuilder()
  .setName('confession')
  .setDescription('Configure and submit anonymous confessions.')
  .addSubcommand((subcommand) => subcommand
    .setName('set')
    .setDescription('Set the confession channel and post its submission panel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel where anonymous confessions will be posted.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription('View the configured confession channel.'))
  .addSubcommand((subcommand) => subcommand
    .setName('clear')
    .setDescription('Disable anonymous confession submissions.'));

function makeButton(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function makePanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Confessions')
        .setDescription('Share something anonymously, create a poll, or reply to a confession.'),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        makeButton(`${confessionPrefix}submit`, 'Submit a confession!', ButtonStyle.Success),
        makeButton(`${confessionPrefix}poll`, 'Submit a poll!', ButtonStyle.Primary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function makeConfessionComponents() {
  return [
    new ActionRowBuilder().addComponents(
      makeButton(`${confessionPrefix}submit`, 'Submit a confession!', ButtonStyle.Success),
      makeButton(`${confessionPrefix}poll`, 'Submit a poll!', ButtonStyle.Primary),
      makeButton(`${confessionPrefix}reply`, 'Reply', ButtonStyle.Primary),
    ),
  ];
}

function makeConfessionEmbed(id, content, isPoll = false) {
  return new EmbedBuilder()
    .setColor(isPoll ? 0xf1c40f : 0x2ecc71)
    .setTitle(`Anonymous ${isPoll ? 'Poll' : 'Confession'} (#${id})`)
    .setDescription(content)
    .setTimestamp();
}

function parsePollAnswers(value) {
  const answers = value.split('\n').map((answer) => answer.trim()).filter(Boolean);
  if (answers.length < 2 || answers.length > maximumPollAnswers) {
    return { error: 'Enter between 2 and 10 poll answers, one per line.' };
  }
  if (answers.some((answer) => answer.length > 55)) {
    return { error: 'Each poll answer must be 55 characters or fewer.' };
  }
  return { answers };
}

function confessionModal() {
  return new ModalBuilder()
    .setCustomId(`${confessionPrefix}modal:confession`)
    .setTitle('Submit a confession')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Your confession')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(2000)
        .setRequired(true),
    ));
}

function pollModal() {
  return new ModalBuilder()
    .setCustomId(`${confessionPrefix}modal:poll`)
    .setTitle('Submit a poll')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('question')
          .setLabel('Poll question')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(300)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('answers')
          .setLabel('Answers (one per line, 2-10)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(600)
          .setRequired(true),
      ),
    );
}

function replyModal(messageId) {
  return new ModalBuilder()
    .setCustomId(`${confessionPrefix}modal:reply:${messageId}`)
    .setTitle('Reply anonymously')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Your reply')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true),
    ));
}

function getModalValue(interaction, name) {
  return interaction.fields.getTextInputValue(name).trim();
}

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: 'You need the Manage Server permission to configure confessions.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'view') {
    const channelId = database.getConfessionChannel(interaction.guildId);
    return interaction.reply({
      content: channelId
        ? `Anonymous confessions are posted in <#${channelId}>.`
        : 'This server does not have a confession channel configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'clear') {
    const removed = database.removeConfessionChannel(interaction.guildId);
    return interaction.reply({
      content: removed
        ? 'Anonymous confession submissions have been disabled.'
        : 'This server does not have a confession channel configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = interaction.options.getChannel('channel', true);
  const botMember = interaction.guild.members.me;
  const botPermissions = botMember && channel.permissionsFor(botMember);
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.SendPolls,
  ];
  if (!botPermissions?.has(requiredPermissions)) {
    return interaction.reply({
      content: 'I need View Channel, Send Messages, Embed Links, Create Public Threads, Send Messages in Threads, and Send Polls permissions in that channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await channel.send(makePanel());
  database.setConfessionChannel(interaction.guildId, channel.id);
  return interaction.reply({
    content: `Anonymous confessions will be posted in <#${channel.id}>. I posted the submission panel there.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleButton(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Confession buttons can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.customId === `${confessionPrefix}submit`) {
    return interaction.showModal(confessionModal());
  }
  if (interaction.customId === `${confessionPrefix}poll`) {
    return interaction.showModal(pollModal());
  }
  if (interaction.customId === `${confessionPrefix}reply`) {
    if (!database.getConfessionThread(interaction.message.id)) {
      return interaction.reply({
        content: 'This confession’s reply thread is unavailable.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.showModal(replyModal(interaction.message.id));
  }
  return interaction.reply({
    content: 'That confession button is not recognized.',
    flags: MessageFlags.Ephemeral,
  });
}

async function getConfessionChannel(interaction, database) {
  const channelId = database.getConfessionChannel(interaction.guildId);
  if (!channelId) {
    await interaction.editReply('Confessions are not set up in this server yet. Ask a moderator to use `/confession set`.');
    return undefined;
  }
  const channel = interaction.guild.channels.cache.get(channelId)
    || await interaction.guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.messages) {
    await interaction.editReply('The configured confession channel is no longer available. Ask a moderator to run `/confession set` again.');
    return undefined;
  }
  return channel;
}

async function handleModalSubmit(interaction, database, { logEvent = defaultLogEvent } = {}) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'Confession submissions can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const [prefix, kind, mode, messageId] = interaction.customId.split(':');
  if (prefix !== 'confession' || kind !== 'modal') {
    return interaction.editReply('That confession form is not recognized.');
  }

  if (mode === 'reply') {
    const setting = database.getConfessionThread(messageId);
    if (!setting) return interaction.editReply('This confession’s reply thread is no longer available.');
    const thread = await interaction.guild.channels.fetch(setting.thread_id);
    if (!thread?.isTextBased() || !thread.messages) {
      return interaction.editReply('This confession’s reply thread is no longer available.');
    }
    const content = getModalValue(interaction, 'content');
    if (!content) return interaction.editReply('Your reply cannot be empty.');
    const replyNumber = database.nextConfessionReplyNumber(messageId);
    await thread.send({
      embeds: [makeConfessionEmbed(`${setting.confession_id}-${replyNumber}`, content, true)
        .setTitle(`Anonymous Reply (#${setting.confession_id}-${replyNumber})`)],
      allowedMentions: { parse: [] },
    });
    await interaction.editReply('Your anonymous reply has been posted.');
    await logEvent(
      interaction.guild,
      database,
      'Anonymous confession reply submitted',
      `Author: ${interaction.user.tag} (<@${interaction.user.id}>)\nConfession: #${setting.confession_id}\nReply: ${content}`,
      undefined,
      'confessions',
    );
    return undefined;
  }

  const isPoll = mode === 'poll';
  if (!isPoll && mode !== 'confession') {
    return interaction.editReply('That confession form is not recognized.');
  }
  const content = isPoll ? getModalValue(interaction, 'question') : getModalValue(interaction, 'content');
  if (!content) return interaction.editReply('Your submission cannot be empty.');

  let answers;
  if (isPoll) {
    const parsed = parsePollAnswers(getModalValue(interaction, 'answers'));
    if (parsed.error) return interaction.editReply(parsed.error);
    answers = parsed.answers;
  }

  const channel = await getConfessionChannel(interaction, database);
  if (!channel) return undefined;
  const confessionId = database.nextConfessionId(interaction.guildId);
  const message = await channel.send({
    embeds: [makeConfessionEmbed(confessionId, content, isPoll)],
    components: makeConfessionComponents(),
    ...(isPoll ? {
      poll: {
        question: { text: content },
        answers: answers.map((text) => ({ text })),
        duration: 24,
        allowMultiselect: false,
      },
    } : {}),
    allowedMentions: { parse: [] },
  });

  try {
    const thread = await message.startThread({ name: `Confession Replies (#${confessionId})` });
    database.setConfessionThread(message.id, thread.id, confessionId);
  } catch (error) {
    console.error(`Could not start a reply thread for confession #${confessionId}:`, error);
    await interaction.editReply('Your confession was posted, but its reply thread could not be created. Please let a moderator know.');
    await logEvent(
      interaction.guild,
      database,
      isPoll ? 'Anonymous poll submitted' : 'Anonymous confession submitted',
      `Author: ${interaction.user.tag} (<@${interaction.user.id}>)\nConfession: #${confessionId}\n${isPoll ? 'Question' : 'Content'}: ${content}\nReply thread creation failed.`,
      undefined,
      'confessions',
    );
    return undefined;
  }

  await interaction.editReply('Your anonymous submission has been posted.');
  await logEvent(
    interaction.guild,
    database,
    isPoll ? 'Anonymous poll submitted' : 'Anonymous confession submitted',
    `Author: ${interaction.user.tag} (<@${interaction.user.id}>)\nConfession: #${confessionId}\n${isPoll ? 'Question' : 'Content'}: ${content}${answers ? `\nAnswers: ${answers.join(' | ')}` : ''}`,
    undefined,
    'confessions',
  );
  return undefined;
}

module.exports = {
  data,
  execute,
  handleButton,
  handleModalSubmit,
  confessionPrefix,
  makeConfessionEmbed,
  parsePollAnswers,
};
