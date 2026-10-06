process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const database = require('../src/database');
const leveling = require('../src/commands/leveling');
const rank = require('../src/commands/rank');
const leaderboard = require('../src/commands/leaderboard');
const { getLevelProgress } = require('../src/leveling-utils');
const { processLevelingMessage } = require('../src/leveling');

function makeLevelingInteraction(group, subcommand, values = {}) {
  const replies = [];
  return {
    replies,
    guildId: 'guild-level-command',
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => subcommand,
      getInteger: (name) => values[name],
    },
    reply: async (reply) => replies.push(reply),
  };
}

test('leveling command schemas serialize and expose rank and leaderboard commands', () => {
  assert.equal(leveling.data.toJSON().name, 'leveling');
  assert.ok(leveling.data.toJSON().options.every((option) => option.type === 2));
  assert.equal(rank.data.toJSON().name, 'rank');
  assert.equal(leaderboard.data.toJSON().name, 'leaderboard');
});

test('leveling settings command enables, configures, validates, and disables XP', async () => {
  await leveling.execute(makeLevelingInteraction('settings', 'enable'), database);
  assert.equal(database.getLevelingSettings('guild-level-command').enabled, true);

  await leveling.execute(makeLevelingInteraction('settings', 'configure', {
    minimum_xp: 3,
    maximum_xp: 7,
    cooldown_seconds: 15,
  }), database);
  assert.deepEqual(
    {
      xp_min: database.getLevelingSettings('guild-level-command').xp_min,
      xp_max: database.getLevelingSettings('guild-level-command').xp_max,
      cooldown_seconds: database.getLevelingSettings('guild-level-command').cooldown_seconds,
    },
    { xp_min: 3, xp_max: 7, cooldown_seconds: 15 },
  );

  const invalid = makeLevelingInteraction('settings', 'configure', {
    minimum_xp: 8,
    maximum_xp: 2,
    cooldown_seconds: 15,
  });
  await leveling.execute(invalid, database);
  assert.match(invalid.replies[0].content, /cannot be greater/);
  assert.equal(database.getLevelingSettings('guild-level-command').xp_min, 3);

  await leveling.execute(makeLevelingInteraction('settings', 'disable'), database);
  assert.equal(database.getLevelingSettings('guild-level-command').enabled, false);
});

test('message XP respects enablement and cooldown and computes levels', () => {
  const guildId = 'guild-level-xp';
  const userId = 'member-level-xp';
  assert.equal(database.getLevelingSettings(guildId).enabled, false);
  assert.equal(database.addLevelingXp(guildId, userId, 100_000), undefined);

  database.updateLevelingSettings(guildId, {
    enabled: true,
    xp_min: 100,
    xp_max: 100,
    cooldown_seconds: 60,
  });
  const firstAward = database.addLevelingXp(guildId, userId, 100_000);
  assert.equal(firstAward.amount, 100);
  assert.equal(firstAward.level, 1);
  assert.equal(firstAward.leveled_up, true);
  assert.equal(database.addLevelingXp(guildId, userId, 120_000), undefined);

  const secondAward = database.addLevelingXp(guildId, userId, 160_000);
  assert.equal(secondAward.total_xp, 200);
  assert.equal(secondAward.leveled_up, false);
  const thirdAward = database.addLevelingXp(guildId, userId, 220_000);
  assert.equal(thirdAward.level, 2);
  assert.equal(getLevelProgress(thirdAward.total_xp).xp_into_level, 0);
});

test('leveling settings, role rewards, and leaderboards are scoped per server', () => {
  const guildId = 'guild-level-config';
  database.updateLevelingSettings(guildId, {
    xp_min: 10,
    xp_max: 20,
    cooldown_seconds: 30,
    announcement_channel_id: 'channel-level-up',
    enabled: true,
  });
  database.setLevelReward(guildId, 5, 'role-5');
  database.setLevelReward(guildId, 10, 'role-10');
  assert.deepEqual(database.getLevelingSettings(guildId).reward_roles, [
    { level: 5, role_id: 'role-5' },
    { level: 10, role_id: 'role-10' },
  ]);
  assert.equal(database.removeLevelReward(guildId, 5), true);
  assert.equal(database.removeLevelReward(guildId, 5), false);
  assert.equal(database.getLevelingSettings('another-guild').enabled, false);
  assert.deepEqual(database.listLevelingLeaderboard(guildId), []);
});

test('level-up grants the configured role and posts an announcement', async () => {
  const guildId = 'guild-level-reward';
  const userId = 'member-level-reward';
  database.updateLevelingSettings(guildId, {
    enabled: true,
    xp_min: 100,
    xp_max: 100,
    cooldown_seconds: 60,
    announcement_channel_id: 'channel-level-reward',
  });
  database.setLevelReward(guildId, 1, 'role-level-one');

  const roles = new Set();
  const role = { id: 'role-level-one' };
  let announcement;
  const announcementChannel = {
    isTextBased: () => true,
    send: async (payload) => { announcement = payload; },
  };
  const guild = {
    id: guildId,
    roles: { cache: new Map([[role.id, role]]) },
    channels: {
      cache: new Map([['channel-level-reward', announcementChannel]]),
      fetch: async () => announcementChannel,
    },
  };
  const message = {
    guild,
    guildId,
    author: { id: userId, username: 'Leveler' },
    member: {
      displayName: 'Leveler',
      roles: {
        cache: { has: (roleId) => roles.has(roleId) },
        add: async (newRole) => roles.add(newRole.id),
        remove: async (roleIds) => roleIds.forEach((roleId) => roles.delete(roleId)),
      },
    },
    channel: announcementChannel,
  };

  await processLevelingMessage(message, database);
  assert.equal(roles.has(role.id), true);
  assert.match(announcement.content, /Leveler.*level 1/);
  assert.deepEqual(announcement.allowedMentions, { parse: [] });
});

test('leveling settings and XP profiles survive reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-leveling-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    const script = `
      const database = require(${JSON.stringify(modulePath)});
      database.updateLevelingSettings('guild-1', { enabled: true, xp_min: 20, xp_max: 30 });
      database.addLevelingXp('guild-1', 'member-1', 100000);
      database.setLevelReward('guild-1', 5, 'role-5');
    `;
    execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getLevelingSettings('guild-1').enabled, true);
      assert.equal(database.getLevelingProfile('guild-1', 'member-1').total_xp > 0, true);
      assert.deepEqual(database.getLevelingSettings('guild-1').reward_roles, [{ level: 5, role_id: 'role-5' }]);
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
