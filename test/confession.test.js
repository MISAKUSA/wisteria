process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { test } = require('node:test');
const database = require('../src/database');
const confession = require('../src/commands/confession');

function makeCommandInteraction(subcommand, channel) {
  const replies = [];
  return {
    replies,
    guildId: 'guild-confession-command',
    guild: { members: { me: { id: 'bot-user' } } },
    inGuild: () => true,
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    options: {
      getSubcommand: () => subcommand,
      getChannel: () => channel,
    },
    reply: async (reply) => replies.push(reply),
  };
}

function makeModalInteraction(customId, values, guild) {
  const replies = [];
  return {
    replies,
    customId,
    guildId: 'guild-confession-modal',
    guild,
    user: { id: 'member-1', tag: 'member#0001' },
    inGuild: () => true,
    fields: { getTextInputValue: (name) => values[name] },
    deferReply: async (response) => replies.push(response),
    editReply: async (response) => replies.push(response),
  };
}

test('/confession set posts the panel and saves the destination', async () => {
  let panel;
  const channel = {
    id: 'confession-channel',
    permissionsFor: () => ({ has: () => true }),
    send: async (message) => { panel = message; },
  };
  const interaction = makeCommandInteraction('set', channel);
  await confession.execute(interaction, database);

  assert.equal(database.getConfessionChannel(interaction.guildId), channel.id);
  assert.equal(panel.embeds[0].data.title, 'Confessions');
  assert.deepEqual(
    panel.components[0].components.map((button) => button.data.label),
    ['Submit a confession!', 'Submit a poll!'],
  );
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
});

test('/confession set rejects a destination without required permissions', async () => {
  const guildId = 'guild-confession-no-permissions';
  const channel = {
    id: 'confession-channel-no-permissions',
    permissionsFor: () => ({ has: () => false }),
    send: async () => assert.fail('Must not post a panel without permissions.'),
  };
  const interaction = makeCommandInteraction('set', channel);
  interaction.guildId = guildId;
  await confession.execute(interaction, database);

  assert.equal(database.getConfessionChannel(guildId), undefined);
  assert.match(interaction.replies[0].content, /Send Polls/);
});

test('confession posts use the anonymous embed layout, thread, and private audit log', async () => {
  let posted;
  let threadName;
  let threadSetting;
  const channel = {
    isTextBased: () => true,
    messages: {},
    send: async (payload) => {
      posted = payload;
      return {
        id: 'confession-message-1',
        startThread: async ({ name }) => {
          threadName = name;
          return { id: 'confession-thread-1' };
        },
      };
    },
  };
  const guild = {
    channels: {
      cache: new Map([['confession-channel', channel]]),
      fetch: async () => channel,
    },
  };
  const eventLogs = [];
  const interaction = makeModalInteraction('confession:modal:confession', {
    content: 'A private thought',
  }, guild);

  await confession.handleModalSubmit(interaction, {
    getConfessionChannel: () => 'confession-channel',
    nextConfessionId: () => 7,
    setConfessionThread: (...setting) => { threadSetting = setting; },
  }, {
    logEvent: async (...entry) => eventLogs.push(entry),
  });

  assert.equal(posted.embeds[0].data.title, 'Anonymous Confession (#7)');
  assert.equal(posted.embeds[0].data.description, 'A private thought');
  assert.deepEqual(posted.allowedMentions, { parse: [] });
  assert.deepEqual(
    posted.components[0].components.map((button) => button.data.label),
    ['Submit a confession!', 'Submit a poll!', 'Reply'],
  );
  assert.equal(threadName, 'Confession Replies (#7)');
  assert.deepEqual(threadSetting, ['confession-message-1', 'confession-thread-1', 7]);
  assert.equal(eventLogs[0][2], 'Anonymous confession submitted');
  assert.match(eventLogs[0][3], /member#0001/);
  assert.match(eventLogs[0][3], /A private thought/);
  assert.equal(interaction.replies.at(-1), 'Your anonymous submission has been posted.');
});

test('poll submissions validate answers and use Discord native polls', async () => {
  let posted;
  const channel = {
    isTextBased: () => true,
    messages: {},
    send: async (payload) => {
      posted = payload;
      return {
        id: 'poll-message-1',
        startThread: async () => ({ id: 'poll-thread-1' }),
      };
    },
  };
  const guild = { channels: { cache: new Map([['poll-channel', channel]]) } };
  const eventLogs = [];
  const interaction = makeModalInteraction('confession:modal:poll', {
    question: 'Which color?',
    answers: 'Green\nBlue',
  }, guild);

  await confession.handleModalSubmit(interaction, {
    getConfessionChannel: () => 'poll-channel',
    nextConfessionId: () => 8,
    setConfessionThread: () => {},
  }, {
    logEvent: async (...entry) => eventLogs.push(entry),
  });

  assert.equal(posted.embeds[0].data.title, 'Anonymous Poll (#8)');
  assert.deepEqual(posted.poll, {
    question: { text: 'Which color?' },
    answers: [{ text: 'Green' }, { text: 'Blue' }],
    duration: 24,
    allowMultiselect: false,
  });
  assert.match(eventLogs[0][3], /Answers: Green \| Blue/);

  const invalid = confession.parsePollAnswers('Only one');
  assert.match(invalid.error, /between 2 and 10/);
  assert.match(confession.parsePollAnswers(`a\n${'x'.repeat(56)}`).error, /55 characters/);
});

test('reply submissions post anonymous thread embeds and log the author privately', async () => {
  let posted;
  const thread = {
    isTextBased: () => true,
    messages: {},
    send: async (payload) => { posted = payload; },
  };
  const guild = { channels: { fetch: async () => thread } };
  const eventLogs = [];
  const interaction = makeModalInteraction('confession:modal:reply:message-1', {
    content: 'A supportive reply',
  }, guild);

  await confession.handleModalSubmit(interaction, {
    getConfessionThread: () => ({ thread_id: 'thread-1', confession_id: 9 }),
    nextConfessionReplyNumber: () => 2,
  }, {
    logEvent: async (...entry) => eventLogs.push(entry),
  });

  assert.equal(posted.embeds[0].data.title, 'Anonymous Reply (#9-2)');
  assert.equal(posted.embeds[0].data.description, 'A supportive reply');
  assert.deepEqual(posted.allowedMentions, { parse: [] });
  assert.equal(eventLogs[0][2], 'Anonymous confession reply submitted');
  assert.match(eventLogs[0][3], /member#0001/);
});

test('confession channel, numbering, and thread settings are scoped and persist in memory', () => {
  database.setConfessionChannel('guild-confession-db', 'channel-confession-db');
  assert.equal(database.getConfessionChannel('guild-confession-db'), 'channel-confession-db');
  assert.equal(database.getConfessionChannel('another-guild'), undefined);
  assert.deepEqual(
    [database.nextConfessionId('guild-confession-db'), database.nextConfessionId('guild-confession-db')],
    [1, 2],
  );
  assert.deepEqual(
    [database.nextConfessionReplyNumber('message-db'), database.nextConfessionReplyNumber('message-db')],
    [2, 3],
  );
  database.setConfessionThread('message-db', 'thread-db', 2);
  assert.deepEqual(database.getConfessionThread('message-db'), {
    thread_id: 'thread-db',
    confession_id: 2,
  });
  assert.equal(database.removeConfessionChannel('guild-confession-db'), true);
});
