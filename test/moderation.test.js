process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { Collection, PermissionFlagsBits } = require('discord.js');
const { test } = require('node:test');
const database = require('../src/database');
const moderation = require('../src/commands/moderation');
const channelperm = require('../src/commands/channelperm');

test('all moderation slash-command schemas serialize', () => {
  const names = moderation.commands.map((command) => command.data.toJSON().name);
  assert.equal(names.length, new Set(names).size);
  assert.ok(moderation.commands.every((command) => typeof command.execute === 'function'));
  const validateOptionOrder = (options = []) => {
    let foundOptional = false;
    for (const option of options) {
      if (option.options) validateOptionOrder(option.options);
      if (option.required === false) foundOptional = true;
      if (option.required === true) assert.equal(foundOptional, false, `${option.name} must appear before optional options`);
    }
  };
  for (const command of moderation.commands) validateOptionOrder(command.data.toJSON().options);
  assert.ok(names.includes('timeout'));
  assert.ok(names.includes('role'));
  assert.ok(names.includes('antiraid'));
  assert.ok(names.includes('honeypot'));
});

test('prefix warn records a scoped moderation case', async () => {
  const targetUser = { id: '12345678901234567', tag: 'member#0001', send: async () => {} };
  const target = {
    id: targetUser.id,
    guild: { id: 'guild-1' },
    user: targetUser,
    manageable: true,
    roles: { highest: { comparePositionTo: () => -1 } },
  };
  const moderator = {
    id: '23456789012345678',
    permissions: { has: () => true },
    roles: { highest: {} },
  };
  const sent = [];
  const message = {
    guild: {
      id: 'guild-1',
      name: 'Test server',
      ownerId: '34567890123456789',
      members: {
        cache: new Map([[target.id, target], [moderator.id, moderator]]),
        fetch: async () => { throw new Error('Expected cached member'); },
      },
    },
    channel: {},
    author: { ...moderator, send: async (content) => sent.push(content), bot: false },
    member: moderator,
  };

  await moderation.executePrefix(message, database, '!', 'warn', '<@12345678901234567> repeated spam');

  const [warning] = database.listWarnings('guild-1', target.id);
  assert.equal(warning.action, 'warn');
  assert.equal(warning.reason, 'repeated spam');
  assert.match(sent[0], /Warning recorded.*case #1/);
});

test('prefix moderator permission is checked before an action runs', async () => {
  let fetched = false;
  const sent = [];
  const message = {
    guild: {
      id: 'guild-1',
      members: { cache: new Map(), fetch: async () => { fetched = true; } },
    },
    author: { id: 'moderator-1', bot: false, send: async (content) => sent.push(content) },
    member: { permissions: { has: () => false } },
  };

  await moderation.executePrefix(message, database, '!', 'warn', '12345678901234567 reason');

  assert.equal(fetched, false);
  assert.match(sent[0], /do not have permission/i);
});

test('quarantine removes its role and restores saved roles on release', async () => {
  const moderatorId = '23456789012345678';
  const targetId = '12345678901234567';
  const originalRole = {
    id: '45678901234567890',
    guild: { id: 'guild-quarantine' },
    editable: true,
    comparePositionTo: () => -1,
  };
  const quarantineRole = {
    id: '56789012345678901',
    guild: { id: 'guild-quarantine' },
    editable: true,
    comparePositionTo: () => -1,
  };
  const memberRoles = new Collection([[originalRole.id, originalRole]]);
  const target = {
    id: targetId,
    guild: { id: 'guild-quarantine' },
    user: { id: targetId, tag: 'member#0001', send: async () => {} },
    manageable: true,
    roles: {
      highest: { comparePositionTo: () => -1 },
      cache: memberRoles,
      remove: async (roles) => {
        for (const role of Array.isArray(roles) ? roles : [roles]) memberRoles.delete(role.id || role);
      },
      add: async (roles) => {
        for (const role of Array.isArray(roles) ? roles : [roles]) memberRoles.set(role.id, role);
      },
    },
  };
  const moderator = {
    id: moderatorId,
    permissions: { has: () => true },
    roles: { highest: {} },
  };
  const guild = {
    id: 'guild-quarantine',
    ownerId: '34567890123456789',
    name: 'Quarantine test',
    members: { cache: new Map([[moderatorId, moderator], [targetId, target]]) },
    roles: { cache: new Map([[originalRole.id, originalRole], [quarantineRole.id, quarantineRole]]) },
  };
  const sent = [];
  const message = {
    guild,
    author: { ...moderator, send: async (content) => sent.push(content), bot: false },
    member: moderator,
  };

  await moderation.executePrefix(
    message,
    database,
    '!',
    'quarantine',
    `<@${targetId}> <@&${quarantineRole.id}> review`,
  );
  assert.equal(memberRoles.has(originalRole.id), false);
  assert.equal(memberRoles.has(quarantineRole.id), true);
  await moderation.executePrefix(message, database, '!', 'unquarantine', `<@${targetId}>`);
  assert.equal(memberRoles.has(originalRole.id), true);
  assert.equal(memberRoles.has(quarantineRole.id), false);
  assert.equal(database.getQuarantine(guild.id, targetId), undefined);
  assert.match(sent[1], /released from quarantine/);
});

test('nuke slash schema requires an explicit confirmation flag', () => {
  const nuke = moderation.commands.find((command) => command.data.name === 'nuke').data.toJSON();
  assert.deepEqual(nuke.options.map((option) => [option.name, option.required]), [['confirm', true]]);
});

function channelPermissionInteraction(subcommand, options = {}) {
  const replies = [];
  const editedOverwrites = [];
  const nsfwChanges = [];
  const channel = {
    id: 'channel-1',
    guildId: 'guild-1',
    name: 'members',
    type: 0,
    permissionOverwrites: {
      edit: async (...args) => editedOverwrites.push(args),
    },
    setNSFW: async (...args) => nsfwChanges.push(args),
  };
  const role = {
    id: 'role-1',
    name: 'Verified',
    guild: { id: 'guild-1' },
    editable: true,
  };
  const interaction = {
    guildId: 'guild-1',
    user: { tag: 'moderator#0001' },
    inGuild: () => true,
    memberPermissions: { has: () => true },
    guild: {
      members: {
        me: { permissions: { has: () => true } },
      },
    },
    options: {
      getSubcommand: () => subcommand,
      getChannel: () => channel,
      getRole: () => role,
      getString: () => options.mode,
      getBoolean: () => options.enabled,
    },
    reply: async (response) => replies.push(response),
  };
  return { interaction, channel, role, replies, editedOverwrites, nsfwChanges };
}

test('channelperm grants, denies, and resets role view access', async () => {
  for (const [mode, expected] of [['allow', true], ['deny', false], ['inherit', null]]) {
    const state = channelPermissionInteraction('access', { mode });
    await channelperm.execute(state.interaction);
    assert.equal(state.editedOverwrites.length, 1);
    assert.equal(state.editedOverwrites[0][0], state.role);
    assert.deepEqual(state.editedOverwrites[0][1], { ViewChannel: expected });
    assert.match(state.replies[0].content, /Verified/);
  }
});

test('channelperm changes NSFW only for the selected channel', async () => {
  const state = channelPermissionInteraction('nsfw', { enabled: true });
  await channelperm.execute(state.interaction);
  assert.deepEqual(state.nsfwChanges[0], [true, 'NSFW setting changed by moderator#0001']);
  assert.match(state.replies[0].content, /marked NSFW/);
});

test('channelperm rejects access changes without Manage Roles', async () => {
  const state = channelPermissionInteraction('access', { mode: 'allow' });
  state.interaction.memberPermissions.has = (permission) => permission !== PermissionFlagsBits.ManageRoles;
  await channelperm.execute(state.interaction);
  assert.equal(state.editedOverwrites.length, 0);
  assert.match(state.replies[0].content, /Manage Roles/);
});

test('channelperm slash schema exposes category access and channel NSFW controls', () => {
  const schema = channelperm.data.toJSON();
  assert.equal(schema.name, 'channelperm');
  assert.deepEqual(schema.options.map((option) => option.name), ['access', 'nsfw']);
  assert.deepEqual(
    schema.options[0].options.find((option) => option.name === 'mode').choices.map((choice) => choice.value),
    ['allow', 'deny', 'inherit'],
  );
});
