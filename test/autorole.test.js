process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { test } = require('node:test');
const database = require('../src/database');
const autoRole = require('../src/commands/autorole');

function makeInteraction(subcommand, role) {
  const replies = [];
  return {
    replies,
    guildId: 'guild-autorole',
    guild: {
      members: {
        me: { permissions: { has: (permission) => permission === PermissionFlagsBits.ManageRoles } },
      },
    },
    inGuild: () => true,
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    options: {
      getSubcommand: () => subcommand,
      getRole: () => role,
    },
    reply: async (reply) => replies.push(reply),
  };
}

test('/autorole set, view, and clear configure server roles', async () => {
  const role = {
    id: 'role-autorole',
    guild: { id: 'guild-autorole' },
    editable: true,
    toString: () => '<@&role-autorole>',
  };
  const setInteraction = makeInteraction('set', role);
  await autoRole.execute(setInteraction, database);
  assert.equal(database.getAutoRole('guild-autorole'), role.id);
  assert.equal(setInteraction.replies[0].flags, MessageFlags.Ephemeral);

  const viewInteraction = makeInteraction('view');
  await autoRole.execute(viewInteraction, database);
  assert.match(viewInteraction.replies[0].content, /<@&role-autorole>/);
  assert.deepEqual(database.getAutoRoles('guild-autorole'), [role.id]);

  const clearInteraction = makeInteraction('clear');
  await autoRole.execute(clearInteraction, database);
  assert.equal(database.getAutoRole('guild-autorole'), undefined);
});

test('/autorole add and remove manage multiple roles without duplicates', async () => {
  const makeRole = (id) => ({
    id,
    guild: { id: 'guild-autorole-multiple' },
    editable: true,
    toString: () => `<@&${id}>`,
  });
  const firstRole = makeRole('role-first');
  const secondRole = makeRole('role-second');
  database.removeAutoRole('guild-autorole-multiple');

  const firstAdd = makeInteraction('add', firstRole);
  firstAdd.guildId = 'guild-autorole-multiple';
  const secondAdd = makeInteraction('add', secondRole);
  secondAdd.guildId = 'guild-autorole-multiple';
  const duplicateAdd = makeInteraction('add', firstRole);
  duplicateAdd.guildId = 'guild-autorole-multiple';
  await autoRole.execute(firstAdd, database);
  await autoRole.execute(secondAdd, database);
  await autoRole.execute(duplicateAdd, database);
  assert.deepEqual(database.getAutoRoles('guild-autorole-multiple'), ['role-first', 'role-second']);

  const viewInteraction = makeInteraction('view');
  viewInteraction.guildId = 'guild-autorole-multiple';
  await autoRole.execute(viewInteraction, database);
  assert.match(viewInteraction.replies[0].content, /<@&role-first>/);
  assert.match(viewInteraction.replies[0].content, /<@&role-second>/);

  const removeInteraction = makeInteraction('remove', firstRole);
  removeInteraction.guildId = 'guild-autorole-multiple';
  await autoRole.execute(removeInteraction, database);
  assert.deepEqual(database.getAutoRoles('guild-autorole-multiple'), ['role-second']);
});

test('/autorole set refuses a role above the bot', async () => {
  const role = {
    id: 'role-too-high',
    guild: { id: 'guild-autorole' },
    editable: false,
  };
  const interaction = makeInteraction('set', role);
  await autoRole.execute(interaction, database);
  assert.equal(database.getAutoRole('guild-autorole'), undefined);
  assert.match(interaction.replies[0].content, /below my highest role/);
});

test('configured role is assigned to new members and missing roles surface errors', async () => {
  let assigned;
  const roles = [
    { id: 'role-new-member', editable: true },
    { id: 'role-new-member-extra', editable: true },
  ];
  const member = {
    id: 'member-new',
    guild: {
      id: 'guild-join',
      roles: {
        cache: new Map(roles.map((role) => [role.id, role])),
        fetch: async () => undefined,
      },
    },
    roles: {
      add: async (assignedRole, reason) => { assigned = { role: assignedRole, reason }; },
    },
  };

  database.setAutoRole(member.guild.id, roles[0].id);
  database.addAutoRole(member.guild.id, roles[1].id);
  assert.equal(await autoRole.assignToNewMember(member, database), true);
  assert.deepEqual(assigned, {
    role: roles,
    reason: 'Configured automatic roles for new members',
  });

  database.addAutoRole(member.guild.id, 'deleted-role');
  await assert.rejects(autoRole.assignToNewMember(member, database), /deleted-role/);
});

test('legacy and multiple automatic roles survive reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-autoroles-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    fs.writeFileSync(databasePath, JSON.stringify({
      autoRoles: { 'legacy-guild': 'legacy-role' },
    }));
    const script = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.deepEqual(database.getAutoRoles('legacy-guild'), ['legacy-role']);
      database.addAutoRole('multiple-guild', 'role-one');
      database.addAutoRole('multiple-guild', 'role-two');
    `;
    execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getAutoRole('legacy-guild'), 'legacy-role');
      assert.deepEqual(database.getAutoRoles('multiple-guild'), ['role-one', 'role-two']);
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
