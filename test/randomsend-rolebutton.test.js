const assert = require('node:assert/strict');
const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { test } = require('node:test');
const randomSend = require('../src/commands/randomsend');
const roleButton = require('../src/commands/rolebutton');

function makeRandomSendInteraction(channels, image = {
  contentType: 'image/png',
  name: 'photo.png',
  url: 'https://cdn.discordapp.com/attachments/photo.png',
}) {
  const replies = [];
  const botMember = { id: 'bot-1' };
  return {
    replies,
    guild: {
      members: { me: botMember },
      channels: { cache: new Map(channels.map((channel) => [channel.id, channel])) },
    },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getAttachment: () => image,
      getString: () => 'A message',
    },
    reply: async (reply) => replies.push(reply),
  };
}

function makeChannel(id, type, canSend = true) {
  return {
    id,
    type,
    permissionsFor: () => ({
      has: (permissions) => canSend
        && permissions.includes(PermissionFlagsBits.ViewChannel)
        && permissions.includes(PermissionFlagsBits.SendMessages)
        && permissions.includes(PermissionFlagsBits.AttachFiles),
    }),
    send: async () => {},
  };
}

test('/randomsend posts the message and image to a random eligible text channel', async () => {
  let sentOptions;
  const textChannel = makeChannel('text-1', ChannelType.GuildText);
  textChannel.send = async (options) => { sentOptions = options; };
  const announcementChannel = makeChannel('announcement-1', ChannelType.GuildAnnouncement, false);
  const voiceChannel = makeChannel('voice-1', ChannelType.GuildVoice);
  const interaction = makeRandomSendInteraction([textChannel, announcementChannel, voiceChannel]);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    await randomSend.execute(interaction);
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(sentOptions, {
    content: 'A message',
    files: [{ attachment: 'https://cdn.discordapp.com/attachments/photo.png', name: 'photo.png' }],
    allowedMentions: { parse: [] },
  });
  assert.equal(interaction.replies[0].content, 'Sent your message with an image to <#text-1>.');
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
});

test('/randomsend rejects non-image attachments without posting', async () => {
  const channel = makeChannel('text-1', ChannelType.GuildText);
  const interaction = makeRandomSendInteraction([channel], { contentType: 'text/plain' });
  await randomSend.execute(interaction);

  assert.match(interaction.replies[0].content, /attachment must be an image/i);
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
});

test('/randomsend reports when no eligible channel can accept attachments', async () => {
  const channel = makeChannel('text-1', ChannelType.GuildText, false);
  const interaction = makeRandomSendInteraction([channel]);
  await randomSend.execute(interaction);

  assert.match(interaction.replies[0].content, /no text channels/i);
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
});

test('/rolebutton posts a role toggle button and returns its message link', async () => {
  let sentOptions;
  const role = { id: 'role-1', name: 'Artist', guild: { id: 'guild-1' }, editable: true };
  const interaction = {
    guildId: 'guild-1',
    guild: {
      members: { me: { permissions: { has: () => true } } },
    },
    channel: {
      send: async (options) => {
        sentOptions = options;
        return { url: 'https://discord.com/channels/guild-1/channel-1/message-1' };
      },
    },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getRole: () => role,
      getString: (name) => (name === 'label' ? 'Get Artist' : 'Click to toggle this role.'),
    },
    reply: async (reply) => {
      interaction.replyOptions = reply;
    },
  };

  await roleButton.execute(interaction);

  assert.equal(sentOptions.content, 'Click to toggle this role.');
  assert.deepEqual(sentOptions.allowedMentions, { parse: [] });
  assert.equal(sentOptions.components[0].components[0].data.custom_id, 'self-role:role-1');
  assert.equal(sentOptions.components[0].components[0].data.label, 'Get Artist');
  assert.match(interaction.replyOptions.content, /https:\/\/discord\.com\/channels\/guild-1\/channel-1\/message-1/);
  assert.equal(interaction.replyOptions.flags, MessageFlags.Ephemeral);
});

test('role button adds a role on first click and removes it on the next', async () => {
  const role = { id: 'role-1', name: 'Artist', guild: { id: 'guild-1' }, editable: true };
  const assignedRoles = new Set();
  const replies = [];
  const member = {
    roles: {
      cache: { has: (roleId) => assignedRoles.has(roleId) },
      add: async (addedRole) => assignedRoles.add(addedRole.id),
      remove: async (removedRole) => assignedRoles.delete(removedRole.id),
    },
  };
  const interaction = {
    customId: 'self-role:role-1',
    guildId: 'guild-1',
    guild: { roles: { cache: new Map([[role.id, role]]) } },
    inGuild: () => true,
    member,
    reply: async (reply) => replies.push(reply),
  };

  await roleButton.handleButton(interaction);
  assert.equal(assignedRoles.has(role.id), true);
  assert.match(replies[0].content, /Added the Artist role/);
  await roleButton.handleButton(interaction);
  assert.equal(assignedRoles.has(role.id), false);
  assert.match(replies[1].content, /Removed the Artist role/);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
});
