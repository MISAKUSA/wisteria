const fs = require('node:fs');
const path = require('node:path');

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bot.json');
const memoryOnly = databasePath === ':memory:';
if (!memoryOnly) fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

function emptyState() {
  return { stickyMessages: {}, autoReactions: {}, notes: [], nextNoteId: 1 };
}

function loadState() {
  if (memoryOnly || !fs.existsSync(databasePath)) return emptyState();
  const savedState = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  const autoReactions = Object.fromEntries(
    Object.entries(savedState.autoReactions || {}).map(([channelId, setting]) => [
      channelId,
      { ...setting, emojis: setting.emojis || (setting.emoji ? [setting.emoji] : []) },
    ]),
  );
  return {
    stickyMessages: savedState.stickyMessages || {},
    autoReactions,
    notes: savedState.notes || [],
    nextNoteId: savedState.nextNoteId || 1,
  };
}

let state = loadState();

function saveState() {
  if (memoryOnly) return;
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, databasePath);
}

module.exports = {
  getSticky(channelId) {
    return state.stickyMessages[channelId];
  },
  setSticky(channelId, messageId, content, updatedBy) {
    state.stickyMessages[channelId] = { channel_id: channelId, message_id: messageId, content, updated_by: updatedBy };
    saveState();
  },
  updateStickyMessage(channelId, messageId) {
    if (!state.stickyMessages[channelId]) return;
    state.stickyMessages[channelId].message_id = messageId;
    saveState();
  },
  removeSticky(channelId) {
    if (!state.stickyMessages[channelId]) return false;
    delete state.stickyMessages[channelId];
    saveState();
    return true;
  },
  getAutoReaction(channelId) {
    return state.autoReactions[channelId];
  },
  setAutoReactions(channelId, emojis, updatedBy) {
    state.autoReactions[channelId] = { channel_id: channelId, emojis, updated_by: updatedBy };
    saveState();
  },
  removeAutoReaction(channelId, emoji) {
    const setting = state.autoReactions[channelId];
    if (!setting) return false;

    if (emoji !== undefined) {
      const emojis = setting.emojis || (setting.emoji ? [setting.emoji] : []);
      const remainingEmojis = emojis.filter((configuredEmoji) => configuredEmoji !== emoji);
      if (remainingEmojis.length === emojis.length) return false;
      if (remainingEmojis.length > 0) {
        state.autoReactions[channelId] = {
          channel_id: channelId,
          emojis: remainingEmojis,
          updated_by: setting.updated_by,
        };
        saveState();
        return true;
      }
    }

    delete state.autoReactions[channelId];
    saveState();
    return true;
  },
  addNote(guildId, userId, authorId, note) {
    const id = state.nextNoteId;
    state.nextNoteId += 1;
    state.notes.push({
      id,
      guild_id: guildId,
      user_id: userId,
      author_id: authorId,
      note,
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
    saveState();
    return id;
  },
  listNotes(guildId, userId) {
    return state.notes
      .filter((note) => note.guild_id === guildId && note.user_id === userId)
      .sort((first, second) => second.id - first.id);
  },
  removeNote(noteId, guildId) {
    const noteIndex = state.notes.findIndex((note) => note.id === noteId && note.guild_id === guildId);
    if (noteIndex === -1) return false;
    state.notes.splice(noteIndex, 1);
    saveState();
    return true;
  },
};