process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const database = require('../src/database');
const starboardCommand = require('../src/commands/starboard');
const { handleStarboardReaction } = require('../src/starboard');

function makeInteraction(subcommand, values = {}) {
  const replies = [];
  return {
    replies,
    guildId: 'guild-starboard-command',
    guild: {
      members: {
        me: { id: 'bot-member' },
      },
    },
    user: { id: 'moderator' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => subcommand,
      getChannel: () => values.channel,
      getInteger: () => values.threshold,
    },
    reply: async (reply) => replies.push(reply),
  };
}

function makeSourceMessage() {
  const sentPosts = new Map();
  const targetChannel = {
    id: 'starboard-channel',
    name: 'starboard',
    isTextBased: () => true,
    messages: {
      fetch: async (messageId) => {
        const post = sentPosts.get(messageId);
        if (!post) {
          const error = new Error('Unknown message');
          error.code = 10008;
          throw error;
        }
        return post;
      },
    },
    send: async (payload) => {
      const post = {
        id: `star-post-${sentPosts.size + 1}`,
        payload,
        edit: async (updatedPayload) => { post.payload = updatedPayload; },
        delete: async () => sentPosts.delete(post.id),
      };
      sentPosts.set(post.id, post);
      return post;
    },
  };
  const guild = {
    id: 'guild-starboard',
    channels: {
      cache: new Map([[targetChannel.id, targetChannel]]),
      fetch: async () => targetChannel,
    },
  };
  const message = {
    id: 'source-message',
    guild,
    guildId: guild.id,
    channelId: 'source-channel',
    channel: { name: 'general' },
    author: {
      id: 'author',
      username: 'Star Author',
      displayAvatarURL: () => 'https://example.com/avatar.png',
    },
    member: { displayName: 'Star Author' },
    content: 'A message worth starring',
    attachments: new Map(),
    reactions: {
      cache: new Map(),
    },
    url: 'https://discord.com/channels/guild-starboard/source-channel/source-message',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const starReaction = {
    emoji: { name: '⭐' },
    count: 0,
    message,
  };
  message.reactions.cache.set('star', starReaction);
  return { message, starReaction, targetChannel, sentPosts };
}

test('starboard command schema and setup use the default threshold', async () => {
  assert.equal(starboardCommand.data.toJSON().name, 'starboard');
  const interaction = makeInteraction('set', {
    channel: {
      id: 'configured-starboard',
      permissionsFor: () => ({ has: () => true }),
    },
  });

  await starboardCommand.execute(interaction, database);
  assert.deepEqual(database.getStarboard(interaction.guildId), {
    guild_id: interaction.guildId,
    channel_id: 'configured-starboard',
    threshold: 3,
    updated_by: 'moderator',
  });
  assert.match(interaction.replies[0].content, /3 ⭐ reactions/);
});

test('starboard publishes at threshold, updates its count, and removes posts below threshold', async () => {
  const guildId = 'guild-starboard';
  const { message, starReaction, sentPosts } = makeSourceMessage();
  database.setStarboard(guildId, 'starboard-channel', 2, 'moderator');

  starReaction.count = 1;
  await handleStarboardReaction(starReaction, { bot: false }, database);
  assert.equal(sentPosts.size, 0);

  starReaction.count = 2;
  await handleStarboardReaction(starReaction, { bot: false }, database);
  assert.equal(sentPosts.size, 1);
  const firstPost = [...sentPosts.values()][0];
  assert.equal(firstPost.payload.content, '⭐ **2**');
  assert.equal(firstPost.payload.embeds[0].data.description, message.content);
  assert.deepEqual(firstPost.payload.allowedMentions, { parse: [] });
  assert.equal(database.getStarredMessage(message.id).message_id, firstPost.id);

  starReaction.count = 3;
  await handleStarboardReaction(starReaction, { bot: false }, database);
  assert.equal(sentPosts.size, 1);
  assert.equal(firstPost.payload.content, '⭐ **3**');

  starReaction.count = 1;
  await handleStarboardReaction(starReaction, { bot: false }, database);
  assert.equal(sentPosts.size, 0);
  assert.equal(database.getStarredMessage(message.id), undefined);
});

test('starboard ignores bot users, bot-authored messages, and non-star reactions', async () => {
  const { message, starReaction, sentPosts } = makeSourceMessage();
  database.setStarboard(message.guildId, 'starboard-channel', 1, 'moderator');

  starReaction.count = 1;
  await handleStarboardReaction(starReaction, { bot: true }, database);
  await handleStarboardReaction({ ...starReaction, emoji: { name: '❤️' } }, { bot: false }, database);
  assert.equal(sentPosts.size, 0);

  message.author.bot = true;
  await handleStarboardReaction(starReaction, { bot: false }, database);
  assert.equal(sentPosts.size, 0);
});

test('starboard configuration and posted-message mappings persist across database reloads', () => {
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-starboard-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    const script = `
      const database = require(${JSON.stringify(modulePath)});
      database.setStarboard('guild-1', 'channel-1', 4, 'moderator-1');
      database.setStarredMessage('source-1', {
        guild_id: 'guild-1',
        channel_id: 'channel-1',
        message_id: 'starred-1',
      });
    `;
    execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getStarboard('guild-1').threshold, 4);
      assert.equal(database.getStarredMessage('source-1').message_id, 'starred-1');
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
