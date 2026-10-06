const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { test } = require('node:test');
const autoDelete = require('../src/commands/autodelete');
const autoThread = require('../src/commands/autothread');

function makeInteraction(subcommand) {
  const replies = [];
  return {
    replies,
    inGuild: () => true,
    memberPermissions: { has: () => true },
    user: { id: 'moderator-1' },
    channel: { id: 'current-channel' },
    options: {
      getChannel: () => ({ id: 'configured-channel' }),
      getSubcommand: () => subcommand,
      getInteger: () => 4,
      getString: () => 'minutes',
    },
    reply: async (reply) => replies.push(reply),
  };
}

test('/autodelete set saves the selected duration in seconds', async () => {
  const interaction = makeInteraction('set');
  let savedSetting;
  const database = {
    setAutoDelete: (...setting) => { savedSetting = setting; },
  };

  await autoDelete.execute(interaction, database);

  assert.deepEqual(savedSetting, ['configured-channel', 240, 'moderator-1']);
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
  assert.match(interaction.replies[0].content, /4 minutes/);
});

test('/autodelete set rejects delays longer than seven days', async () => {
  const interaction = makeInteraction('set');
  interaction.options.getInteger = () => 169;
  interaction.options.getString = () => 'hours';
  let saved = false;
  await autoDelete.execute(interaction, {
    setAutoDelete: () => { saved = true; },
  });

  assert.equal(saved, false);
  assert.match(interaction.replies[0].content, /maximum.*7 days/i);
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
});

test('/autothread set enables image threads for the chosen channel', async () => {
  const interaction = makeInteraction('set');
  let savedSetting;
  const database = {
    setAutoThread: (...setting) => { savedSetting = setting; },
  };

  await autoThread.execute(interaction, database);

  assert.deepEqual(savedSetting, ['configured-channel', 'moderator-1']);
  assert.equal(interaction.replies[0].flags, MessageFlags.Ephemeral);
  assert.match(interaction.replies[0].content, /will start a thread/);
});
