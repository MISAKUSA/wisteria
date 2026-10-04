const fs = require('node:fs');
const path = require('node:path');

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bot.json');
const memoryOnly = databasePath === ':memory:';
if (!memoryOnly) fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

function emptyState() {
  return { stickyMessages: {}, notes: [], nextNoteId: 1 };
}

function loadState() {
  if (memoryOnly || !fs.existsSync(databasePath)) return emptyState();
  const savedState = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  return {
    stickyMessages: savedState.stickyMessages || {},
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