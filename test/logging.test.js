process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { test } = require('node:test');
const database = require('../src/database');
const logging = require('../src/commands/logging');
const { logEvent } = require('../src/logging');

function makeInteraction(subcommand, channel) {
  const replies = [];
  return {
    replies,
    guildId: 'guild-logging',
    guild: { members: { me: { id: 'bot-1' } } },
    inGuild: () => true,
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    options: {
      getSubcommand: () => subcommand,
      getChannel: () => channel,
    },
    reply: async (reply) => replies.push(reply),
  };
}

test('/logging configures, displays, and clears this server’s log channel', async () => {
  const setInteraction = makeInteraction('set', {
    id: 'channel-logging',
    permissionsFor: () => ({ has: () => true }),
  });
  await logging.execute(setInteraction, database);
  assert.equal(database.getLoggingChannel('guild-logging'), 'channel-logging');
  assert.equal(setInteraction.replies[0].flags, MessageFlags.Ephemeral);

  const viewInteraction = makeInteraction('view');
  await logging.execute(viewInteraction, database);
  assert.match(viewInteraction.replies[0].content, /<#channel-logging>/);

  const clearInteraction = makeInteraction('clear');
  await logging.execute(clearInteraction, database);
  assert.equal(database.getLoggingChannel('guild-logging'), undefined);
  assert.match(clearInteraction.replies[0].content, /disabled/);
});

test('/logging enable and disable preserve the configured channel', async () => {
  database.setLoggingChannel('guild-logging-toggle', 'channel-toggle');
  database.setLoggingEnabled('guild-logging-toggle', false);
  const enableInteraction = makeInteraction('enable');
  enableInteraction.guildId = 'guild-logging-toggle';
  await logging.execute(enableInteraction, database);
  assert.equal(database.isLoggingEnabled('guild-logging-toggle'), true);
  assert.equal(database.getLoggingChannel('guild-logging-toggle'), 'channel-toggle');

  const disableInteraction = makeInteraction('disable');
  disableInteraction.guildId = 'guild-logging-toggle';
  await logging.execute(disableInteraction, database);
  assert.equal(database.isLoggingEnabled('guild-logging-toggle'), false);
  assert.equal(database.getLoggingChannel('guild-logging-toggle'), 'channel-toggle');
});

test('/logging event configures a single event type without disabling other logs', async () => {
  const replies = [];
  const interaction = makeInteraction('event');
  interaction.guildId = 'guild-logging-types';
  interaction.options.getString = () => 'videos';
  interaction.options.getBoolean = () => false;
  interaction.reply = async (reply) => replies.push(reply);

  await logging.execute(interaction, database);

  assert.equal(database.isLoggingTypeEnabled('guild-logging-types', 'videos'), false);
  assert.equal(database.isLoggingTypeEnabled('guild-logging-types', 'photos'), true);
  assert.match(replies[0].content, /Videos logging has been disabled/);

  const viewReplies = [];
  const viewInteraction = makeInteraction('types');
  viewInteraction.guildId = 'guild-logging-types';
  viewInteraction.reply = async (reply) => viewReplies.push(reply);
  await logging.execute(viewInteraction, database);
  assert.match(viewReplies[0].content, /Videos:.*Disabled/);
  assert.match(viewReplies[0].content, /Photos:.*Enabled/);
});

test('/logging set refuses a channel the bot cannot use for embeds', async () => {
  const interaction = makeInteraction('set', {
    id: 'channel-logging',
    permissionsFor: () => ({ has: () => false }),
  });
  await logging.execute(interaction, database);
  assert.equal(database.getLoggingChannel('guild-logging'), undefined);
  assert.match(interaction.replies[0].content, /Embed Links/);
});

test('event logger sends an embed to the configured channel and does nothing when unset', async () => {
  let sent;
  const guild = {
    id: 'guild-logging-events',
    channels: {
      cache: new Map([['channel-logging', {
        isTextBased: () => true,
        messages: {},
        send: async (payload) => { sent = payload; },
      }]]),
      fetch: async () => undefined,
    },
  };
  const eventDatabase = {
    getLoggingChannel: (guildId) => (guildId === guild.id ? 'channel-logging' : undefined),
  };

  await logEvent(guild, eventDatabase, 'Test event', 'A test event.');
  assert.equal(sent.embeds[0].data.title, 'Test event');
  assert.equal(sent.embeds[0].data.description, 'A test event.');
  assert.deepEqual(sent.allowedMentions, { parse: [] });

  sent = undefined;
  await logEvent({ ...guild, id: 'guild-without-logs' }, eventDatabase, 'Test event', 'Ignored.');
  assert.equal(sent, undefined);

  await logEvent(guild, {
    ...eventDatabase,
    isLoggingEnabled: () => false,
  }, 'Test event', 'Ignored while disabled.');
  assert.equal(sent, undefined);
});

test('event logger filters configured event types and defaults unspecified types to enabled', async () => {
  let sent = 0;
  const guild = {
    id: 'guild-logging-filter',
    channels: {
      cache: new Map([['channel-logging', {
        isTextBased: () => true,
        messages: {},
        send: async () => { sent += 1; },
      }]]),
      fetch: async () => undefined,
    },
  };
  const eventDatabase = {
    getLoggingChannel: () => 'channel-logging',
    isLoggingTypeEnabled: (guildId, type) => !(guildId === guild.id && type === 'videos'),
  };

  await logEvent(guild, eventDatabase, 'Video shared', 'A video.', undefined, 'videos');
  assert.equal(sent, 0);
  await logEvent(guild, eventDatabase, 'Photo shared', 'A photo.', undefined, 'photos');
  assert.equal(sent, 1);
  await logEvent(guild, eventDatabase, 'Uncategorized event', 'Still enabled.');
  assert.equal(sent, 2);
});

test('media logging recognizes uploaded photos, videos, and voice messages', () => {
  const { getMediaLog } = require('../src/logging');
  const makeMessage = (attachments, voice = false) => ({
    attachments: new Map(attachments.map((attachment, index) => [`attachment-${index}`, attachment])),
    flags: { has: () => voice },
    author: { id: 'user-media', tag: 'Member' },
    channelId: 'channel-media',
    content: 'A caption',
  });

  const photoLog = getMediaLog(makeMessage([{ name: 'photo.jpg', contentType: 'image/jpeg', url: 'https://cdn.test/photo.jpg' }]));
  assert.match(photoLog.title, /Photo/);
  assert.equal(photoLog.events[0].type, 'photos');
  const videoLog = getMediaLog(makeMessage([{ name: 'clip.mp4', contentType: 'video/mp4', url: 'https://cdn.test/clip.mp4' }]));
  assert.match(videoLog.title, /Video/);
  assert.equal(videoLog.events[0].type, 'videos');
  const voiceLog = getMediaLog(makeMessage([{ name: 'voice.ogg', contentType: 'audio/ogg', url: 'https://cdn.test/voice.ogg' }], true));
  assert.match(voiceLog.title, /Voice message/);
  assert.match(voiceLog.description, /https:\/\/cdn\.test\/voice\.ogg/);
  assert.equal(voiceLog.events[0].type, 'voice_messages');
  assert.equal(getMediaLog(makeMessage([{ name: 'notes.txt', contentType: 'text/plain', url: 'https://cdn.test/notes.txt' }])), undefined);

  const mixedLog = getMediaLog(makeMessage([
    { name: 'photo.jpg', contentType: 'image/jpeg', url: 'https://cdn.test/photo.jpg' },
    { name: 'clip.mp4', contentType: 'video/mp4', url: 'https://cdn.test/clip.mp4' },
  ]));
  assert.deepEqual(mixedLog.events.map((event) => event.type), ['photos', 'videos']);
  assert.match(mixedLog.events[0].description, /photo\.jpg/);
  assert.doesNotMatch(mixedLog.events[0].description, /clip\.mp4/);
});

test('logging channel settings survive reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-logging-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    const script = `
      const database = require(${JSON.stringify(modulePath)});
      database.setLoggingChannel('guild-1', 'channel-1');
      database.setLoggingEnabled('guild-1', false);
      database.setLoggingTypeEnabled('guild-1', 'videos', false);
    `;
    execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getLoggingChannel('guild-1'), 'channel-1');
      assert.equal(database.isLoggingEnabled('guild-1'), false);
      assert.equal(database.isLoggingTypeEnabled('guild-1', 'videos'), false);
      assert.equal(database.isLoggingTypeEnabled('guild-1', 'photos'), true);
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
