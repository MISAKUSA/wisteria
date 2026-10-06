process.env.DATABASE_PATH = ':memory:';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const database = require('../src/database');

test('sticky settings can be created, updated, and removed', () => {
  database.setSticky('channel-1', 'message-1', 'Welcome!', 'moderator-1');
  assert.equal(database.getSticky('channel-1').content, 'Welcome!');

  database.setSticky('channel-1', 'message-2', 'Updated welcome', 'moderator-2');
  assert.equal(database.getSticky('channel-1').message_id, 'message-2');
  assert.equal(database.removeSticky('channel-1'), true);
  assert.equal(database.getSticky('channel-1'), undefined);
});

test('automatic reactions can be added and removed per channel', () => {
  database.setAutoReactions('channel-1', ['✅', '⭐'], 'moderator-1');
  assert.deepEqual(database.getAutoReaction('channel-1').emojis, ['✅', '⭐']);
  assert.equal(database.getAutoReaction('channel-2'), undefined);

  assert.equal(database.removeAutoReaction('channel-1', '✅'), true);
  assert.deepEqual(database.getAutoReaction('channel-1').emojis, ['⭐']);
  assert.equal(database.removeAutoReaction('channel-1', '❌'), false);
  assert.equal(database.removeAutoReaction('channel-1'), true);
  assert.equal(database.removeAutoReaction('channel-1'), false);
  assert.equal(database.getAutoReaction('channel-1'), undefined);
});

test('automatic deletion and image-thread settings are scoped to their channels', () => {
  database.setAutoDelete('channel-1', 300, 'moderator-1');
  assert.equal(database.getAutoDelete('channel-1').delay_seconds, 300);
  assert.equal(database.getAutoDelete('channel-2'), undefined);
  assert.equal(database.removeAutoDelete('channel-1'), true);
  assert.equal(database.removeAutoDelete('channel-1'), false);

  database.setAutoThread('channel-1', 'moderator-1');
  assert.equal(database.getAutoThread('channel-1').updated_by, 'moderator-1');
  assert.equal(database.getAutoThread('channel-2'), undefined);
  assert.equal(database.removeAutoThread('channel-1'), true);
  assert.equal(database.removeAutoThread('channel-1'), false);
});

test('custom commands are saved, updated, listed, and scoped to a server', () => {
  assert.equal(database.setCustomCommand('guild-1', 'rules', 'Read the rules.', 'moderator-1'), false);
  assert.deepEqual(database.getCustomCommand('guild-1', 'rules'), {
    guild_id: 'guild-1',
    name: 'rules',
    response: 'Read the rules.',
    created_by: 'moderator-1',
  });
  assert.equal(database.setCustomCommand('guild-1', 'rules', 'Updated rules.', 'moderator-2'), true);
  assert.equal(database.getCustomCommand('guild-1', 'rules').response, 'Updated rules.');
  assert.equal(database.getCustomCommand('guild-2', 'rules'), undefined);
  assert.deepEqual(database.listCustomCommandGuildIds(), ['guild-1']);
  assert.equal(database.removeCustomCommand('guild-1', 'rules').response, 'Updated rules.');
  assert.deepEqual(database.listCustomCommandGuildIds(), []);
});

test('older single-emoji auto-reaction settings still load', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-legacy-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    fs.writeFileSync(databasePath, JSON.stringify({
      autoReactions: {
        'channel-1': { channel_id: 'channel-1', emoji: '✅', updated_by: 'moderator-1' },
      },
    }));
    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.deepEqual(database.getAutoReaction('channel-1').emojis, ['✅']);
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('user notes stay scoped to their server and can be removed', () => {
  const noteId = database.addNote('guild-1', 'user-1', 'moderator-1', 'Follow up next week.');

  assert.equal(database.listNotes('guild-1', 'user-1').length, 1);
  assert.equal(database.listNotes('guild-2', 'user-1').length, 0);
  assert.equal(database.removeNote(noteId, 'guild-2'), false);
  assert.equal(database.removeNote(noteId, 'guild-1'), true);
  assert.equal(database.listNotes('guild-1', 'user-1').length, 0);
});

test('moderation cases and warnings are scoped to their server', () => {
  const first = database.addModerationCase('guild-1', {
    action: 'warn',
    target_id: 'user-1',
    target_label: 'member#0001',
    moderator_id: 'mod-1',
    reason: 'Spam',
  });
  const second = database.addModerationCase('guild-1', {
    action: 'timeout',
    target_id: 'user-1',
    target_label: 'member#0001',
    moderator_id: 'mod-1',
    reason: 'Repeated spam',
  });
  const otherGuildWarning = database.addModerationCase('guild-2', {
    action: 'warn',
    target_id: 'user-1',
    target_label: 'member#0001',
    moderator_id: 'mod-1',
    reason: 'Other server issue',
  });

  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.equal(otherGuildWarning.id, 1);
  assert.deepEqual(database.listWarnings('guild-1', 'user-1'), [first]);
  assert.equal(database.getModerationCase('guild-2', otherGuildWarning.id).reason, 'Other server issue');
  assert.equal(database.removeWarning('guild-1', second.id), false);
  assert.equal(database.removeWarning('guild-1', first.id), true);
  assert.equal(database.getModerationCase('guild-2', otherGuildWarning.id).reason, 'Other server issue');
  assert.equal(database.removeWarning('guild-2', otherGuildWarning.id), true);
  assert.equal(database.clearWarnings('guild-1', 'user-1'), 0);
});

test('server prefixes, raid settings, honeypots, quarantines and lockdowns persist', () => {
  database.setPrefix('guild-1', '?');
  assert.equal(database.getPrefix('guild-1'), '?');
  assert.equal(database.getPrefix('guild-2'), '!');
  database.setAntiRaid('guild-1', { enabled: true, threshold: 10 });
  assert.equal(database.getAntiRaid('guild-1').threshold, 10);
  database.setHoneypot('channel-1', { action: 'kick' });
  assert.equal(database.getHoneypot('channel-1').action, 'kick');
  database.setQuarantine('guild-1', 'user-1', ['role-1'], 'mod-1');
  assert.deepEqual(database.getQuarantine('guild-1', 'user-1').role_ids, ['role-1']);
  assert.deepEqual(database.removeQuarantine('guild-1', 'user-1').role_ids, ['role-1']);
  database.setLockdown('channel-1', { send_messages: null }, Date.now() + 5000, 'mod-1');
  assert.equal(database.listLockdowns()[0].channel_id, 'channel-1');
  assert.equal(database.removeLockdown('channel-1'), true);
});

test('file-backed data survives reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    const writeScript = `
      const database = require(${JSON.stringify(modulePath)});
      database.setSticky('channel-1', 'message-1', 'Welcome!', 'moderator-1');
      database.setAutoReactions('channel-1', ['✅', '⭐'], 'moderator-1');
      database.setAutoDelete('channel-1', 300, 'moderator-1');
      database.setAutoThread('channel-1', 'moderator-1');
      database.addNote('guild-1', 'user-1', 'moderator-1', 'Follow up next week.');
      database.addModerationCase('guild-1', {
        action: 'warn',
        target_id: 'user-1',
        target_label: 'member#0001',
        moderator_id: 'moderator-1',
        reason: 'Spam',
      });
      database.setPrefix('guild-1', '?');
      database.setTemporaryMute('guild-1', 'user-1', Date.now() + 5000);
    `;
    execFileSync(process.execPath, ['-e', writeScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });

    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getSticky('channel-1').content, 'Welcome!');
      assert.deepEqual(database.getAutoReaction('channel-1').emojis, ['✅', '⭐']);
      assert.equal(database.getAutoDelete('channel-1').delay_seconds, 300);
      assert.equal(database.getAutoThread('channel-1').updated_by, 'moderator-1');
      assert.equal(database.listNotes('guild-1', 'user-1')[0].note, 'Follow up next week.');
      assert.equal(database.listWarnings('guild-1', 'user-1')[0].reason, 'Spam');
      assert.equal(database.getPrefix('guild-1'), '?');
      assert.equal(database.listTemporaryMutes()[0].user_id, 'user-1');
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});