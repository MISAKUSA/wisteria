const assert = require('node:assert/strict');
const { test } = require('node:test');
const { handleMessageAutomations } = require('../src/message-automations');

test('auto-delete waits for the configured delay and auto-threads image posts', async () => {
  const originalSetTimeout = global.setTimeout;
  let deleteMessage;
  let delay;
  let threadOptions;
  const database = {
    getAutoDelete: () => ({ delay_seconds: 30 }),
    getAutoThread: () => ({ channel_id: 'channel-1' }),
  };
  const message = {
    guild: {},
    author: { bot: false, username: 'member' },
    channelId: 'channel-1',
    content: 'Photo discussion',
    hasThread: false,
    attachments: [{
      contentType: 'image/png',
      name: 'photo.png',
    }],
    delete: async () => { deleteMessage = true; },
    startThread: async (options) => { threadOptions = options; },
  };

  global.setTimeout = (callback, timeout) => {
    deleteMessage = callback;
    delay = timeout;
    return {};
  };
  try {
    handleMessageAutomations(message, database);
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.equal(delay, 30000);
  assert.deepEqual(threadOptions, { name: 'Photo discussion' });
  deleteMessage();
  await new Promise((resolve) => originalSetTimeout(resolve, 0));
  assert.equal(deleteMessage, true);
});

test('auto-thread uses the image filename if the message has no text', () => {
  let threadOptions;
  handleMessageAutomations({
    guild: {},
    author: { bot: false, username: 'member' },
    channelId: 'channel-1',
    content: '',
    hasThread: false,
    attachments: [{
      contentType: 'image/jpeg',
      name: 'summer-photo.jpg',
    }],
    startThread: async (options) => { threadOptions = options; },
  }, {
    getAutoDelete: () => undefined,
    getAutoThread: () => ({ channel_id: 'channel-1' }),
  });

  assert.deepEqual(threadOptions, { name: 'summer-photo' });
});

test('message automations skip bots, non-image messages, and messages already threaded', () => {
  let actionCalled = false;
  const database = {
    getAutoDelete: () => undefined,
    getAutoThread: () => ({ channel_id: 'channel-1' }),
  };
  const makeMessage = (overrides = {}) => ({
    guild: {},
    author: { bot: false, username: 'member' },
    channelId: 'channel-1',
    content: '',
    hasThread: false,
    attachments: [],
    delete: async () => { actionCalled = true; },
    startThread: async () => { actionCalled = true; },
    ...overrides,
  });

  handleMessageAutomations(makeMessage({ author: { bot: true } }), database);
  handleMessageAutomations(makeMessage(), { ...database, getAutoDelete: () => undefined, getAutoThread: () => ({}) });
  handleMessageAutomations(makeMessage({
    hasThread: true,
    attachments: [{ contentType: 'image/png', name: 'photo.png' }],
  }), { ...database, getAutoDelete: () => undefined });

  assert.equal(actionCalled, false);
});
