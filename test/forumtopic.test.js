const assert = require('node:assert/strict');
const { ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { test } = require('node:test');
const forumTopic = require('../src/commands/forumtopic');

test('/forumtopic creates a post in the selected forum without triggering mentions', async () => {
  let createOptions;
  let replyOptions;
  const image = {
    contentType: 'image/png',
    name: 'topic.png',
    url: 'https://cdn.discordapp.com/attachments/topic.png',
  };
  const forum = {
    id: 'forum-1',
    guildId: 'guild-1',
    type: ChannelType.GuildForum,
    threads: {
      create: async (options) => {
        createOptions = options;
        return { url: 'https://discord.example/topic-1' };
      },
    },
  };
  const interaction = {
    guildId: 'guild-1',
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => forum,
      getString: (name) => (name === 'title' ? 'Topic title' : 'Hello @everyone'),
      getAttachment: () => image,
    },
    reply: async (options) => {
      replyOptions = options;
    },
  };

  await forumTopic.execute(interaction);

  assert.deepEqual(createOptions, {
    name: 'Topic title',
    message: {
      content: 'Hello @everyone',
      allowedMentions: { parse: [] },
      files: [{ attachment: image.url, name: image.name }],
    },
  });
  assert.equal(replyOptions.flags, MessageFlags.Ephemeral);
  assert.match(replyOptions.content, /https:\/\/discord\.example\/topic-1/);
});

test('/forumtopic creates a post without an image when none is attached', async () => {
  let createOptions;
  const interaction = {
    guildId: 'guild-1',
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => ({
        id: 'forum-1',
        guildId: 'guild-1',
        type: ChannelType.GuildForum,
        threads: {
          create: async (options) => {
            createOptions = options;
            return { url: 'https://discord.example/topic-1' };
          },
        },
      }),
      getString: (name) => (name === 'title' ? 'Topic title' : 'Hello'),
      getAttachment: () => null,
    },
    reply: async () => {},
  };

  await forumTopic.execute(interaction);

  assert.deepEqual(createOptions.message, {
    content: 'Hello',
    allowedMentions: { parse: [] },
  });
});

test('/forumtopic rejects a non-image attachment', async () => {
  let createCalled = false;
  let replyOptions;
  const interaction = {
    guildId: 'guild-1',
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => ({
        id: 'forum-1',
        guildId: 'guild-1',
        type: ChannelType.GuildForum,
      }),
      getString: () => 'Topic',
      getAttachment: () => ({ contentType: 'text/plain' }),
    },
    reply: async (options) => {
      replyOptions = options;
    },
  };
  interaction.options.getChannel().threads = {
    create: async () => { createCalled = true; },
  };

  await forumTopic.execute(interaction);

  assert.equal(createCalled, false);
  assert.equal(replyOptions.content, 'The attachment must be an image.');
  assert.equal(replyOptions.flags, MessageFlags.Ephemeral);
});

test('/forumtopic rejects a forum channel from another server', async () => {
  let createCalled = false;
  let replyOptions;
  const interaction = {
    guildId: 'guild-1',
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getChannel: () => ({
        id: 'forum-2',
        guildId: 'guild-2',
        type: ChannelType.GuildForum,
        threads: { create: async () => { createCalled = true; } },
      }),
    },
    reply: async (options) => {
      replyOptions = options;
    },
  };

  await forumTopic.execute(interaction);

  assert.equal(createCalled, false);
  assert.equal(replyOptions.flags, MessageFlags.Ephemeral);
});

test('/forumtopic rejects members without Manage Server permission', async () => {
  let channelOptionRead = false;
  let replyOptions;
  const interaction = {
    inGuild: () => true,
    memberPermissions: { has: (permission) => permission !== PermissionFlagsBits.ManageGuild },
    options: {
      getChannel: () => { channelOptionRead = true; },
    },
    reply: async (options) => {
      replyOptions = options;
    },
  };

  await forumTopic.execute(interaction);

  assert.equal(channelOptionRead, false);
  assert.equal(replyOptions.content, 'You need the Manage Server permission to use this command.');
  assert.equal(replyOptions.flags, MessageFlags.Ephemeral);
});
