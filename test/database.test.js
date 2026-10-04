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

test('user notes stay scoped to their server and can be removed', () => {
  const noteId = database.addNote('guild-1', 'user-1', 'moderator-1', 'Follow up next week.');

  assert.equal(database.listNotes('guild-1', 'user-1').length, 1);
  assert.equal(database.listNotes('guild-2', 'user-1').length, 0);
  assert.equal(database.removeNote(noteId, 'guild-2'), false);
  assert.equal(database.removeNote(noteId, 'guild-1'), true);
  assert.equal(database.listNotes('guild-1', 'user-1').length, 0);
});

test('file-backed data survives reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dweeball-'));
  const databasePath = path.join(directory, 'bot.json');
  const modulePath = require.resolve('../src/database');

  try {
    const writeScript = `
      const database = require(${JSON.stringify(modulePath)});
      database.setSticky('channel-1', 'message-1', 'Welcome!', 'moderator-1');
      database.addNote('guild-1', 'user-1', 'moderator-1', 'Follow up next week.');
    `;
    execFileSync(process.execPath, ['-e', writeScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });

    const verifyScript = `
      const assert = require('node:assert/strict');
      const database = require(${JSON.stringify(modulePath)});
      assert.equal(database.getSticky('channel-1').content, 'Welcome!');
      assert.equal(database.listNotes('guild-1', 'user-1')[0].note, 'Follow up next week.');
    `;
    execFileSync(process.execPath, ['-e', verifyScript], {
      env: { ...process.env, DATABASE_PATH: databasePath },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});