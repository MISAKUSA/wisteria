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

test('file-backed data survives reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisteria-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    const writeScript = `
      const database = require(${JSON.stringify(modulePath)});
      database.setSticky('channel-1', 'message-1', 'Welcome!', 'moderator-1');
      database.setAutoReactions('channel-1', ['✅', '⭐'], 'moderator-1');
      database.addNote('guild-1', 'user-1', 'moderator-1', 'Follow up next week.');
    `;
    execFileSync(process.execPath, ['-e', writeScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });

    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getSticky('channel-1').content, 'Welcome!');
      assert.deepEqual(database.getAutoReaction('channel-1').emojis, ['✅', '⭐']);
      assert.equal(database.listNotes('guild-1', 'user-1')[0].note, 'Follow up next week.');
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});