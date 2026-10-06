const fs = require('node:fs');
const path = require('node:path');
const { levelForXp } = require('./leveling-utils');

const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bot.json');
const memoryOnly = databasePath === ':memory:';
if (!memoryOnly) fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

function emptyState() {
  return {
    stickyMessages: {},
    starboards: {},
    starredMessages: {},
    autoReactions: {},
    autoDeletes: {},
    autoThreads: {},
    customCommands: [],
    notes: [],
    nextNoteId: 1,
    moderationCases: {},
    nextModerationCaseIds: {},
    prefixes: {},
    antiRaidSettings: {},
    honeypots: {},
    quarantines: {},
    lockdowns: {},
    temporaryMutes: {},
    loggingChannels: {},
    loggingEnabled: {},
    loggingTypes: {},
    confessionChannels: {},
    nextConfessionIds: {},
    nextConfessionReplyNumbers: {},
    confessionThreads: {},
    autoRoles: {},
    levelingSettings: {},
    levelingUsers: {},
  };
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
  const autoRoles = Object.fromEntries(
    Object.entries(savedState.autoRoles || {}).map(([guildId, roles]) => [
      guildId,
      Array.isArray(roles) ? roles : [roles],
    ]),
  );
  return {
    stickyMessages: savedState.stickyMessages || {},
    starboards: savedState.starboards || {},
    starredMessages: savedState.starredMessages || {},
    autoReactions,
    autoDeletes: savedState.autoDeletes || {},
    autoThreads: savedState.autoThreads || {},
    customCommands: savedState.customCommands || [],
    notes: savedState.notes || [],
    nextNoteId: savedState.nextNoteId || 1,
    moderationCases: savedState.moderationCases || {},
    nextModerationCaseIds: savedState.nextModerationCaseIds || {},
    prefixes: savedState.prefixes || {},
    antiRaidSettings: savedState.antiRaidSettings || {},
    honeypots: savedState.honeypots || {},
    quarantines: savedState.quarantines || {},
    lockdowns: savedState.lockdowns || {},
    temporaryMutes: savedState.temporaryMutes || {},
    loggingChannels: savedState.loggingChannels || {},
    loggingEnabled: savedState.loggingEnabled || {},
    loggingTypes: savedState.loggingTypes || {},
    confessionChannels: savedState.confessionChannels || {},
    nextConfessionIds: savedState.nextConfessionIds || {},
    nextConfessionReplyNumbers: savedState.nextConfessionReplyNumbers || {},
    confessionThreads: savedState.confessionThreads || {},
    autoRoles,
    levelingSettings: savedState.levelingSettings || {},
    levelingUsers: savedState.levelingUsers || {},
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
  getStarboard(guildId) {
    return state.starboards[guildId];
  },
  setStarboard(guildId, channelId, threshold, updatedBy) {
    state.starboards[guildId] = {
      guild_id: guildId,
      channel_id: channelId,
      threshold,
      updated_by: updatedBy,
    };
    saveState();
  },
  removeStarboard(guildId) {
    if (!state.starboards[guildId]) return false;
    delete state.starboards[guildId];
    saveState();
    return true;
  },
  getStarredMessage(messageId) {
    return state.starredMessages[messageId];
  },
  setStarredMessage(messageId, starboardMessage) {
    state.starredMessages[messageId] = starboardMessage;
    saveState();
  },
  removeStarredMessage(messageId) {
    if (!state.starredMessages[messageId]) return false;
    delete state.starredMessages[messageId];
    saveState();
    return true;
  },
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
  getAutoDelete(channelId) {
    return state.autoDeletes[channelId];
  },
  setAutoDelete(channelId, delaySeconds, updatedBy) {
    state.autoDeletes[channelId] = {
      channel_id: channelId,
      delay_seconds: delaySeconds,
      updated_by: updatedBy,
    };
    saveState();
  },
  removeAutoDelete(channelId) {
    if (!state.autoDeletes[channelId]) return false;
    delete state.autoDeletes[channelId];
    saveState();
    return true;
  },
  getAutoThread(channelId) {
    return state.autoThreads[channelId];
  },
  setAutoThread(channelId, updatedBy) {
    state.autoThreads[channelId] = { channel_id: channelId, updated_by: updatedBy };
    saveState();
  },
  removeAutoThread(channelId) {
    if (!state.autoThreads[channelId]) return false;
    delete state.autoThreads[channelId];
    saveState();
    return true;
  },
  getCustomCommand(guildId, name) {
    return state.customCommands.find((command) => command.guild_id === guildId && command.name === name);
  },
  listCustomCommands(guildId) {
    return state.customCommands
      .filter((command) => command.guild_id === guildId)
      .sort((first, second) => first.name.localeCompare(second.name));
  },
  listCustomCommandGuildIds() {
    return [...new Set(state.customCommands.map((command) => command.guild_id))];
  },
  setCustomCommand(guildId, name, response, createdBy) {
    const existing = this.getCustomCommand(guildId, name);
    const command = { guild_id: guildId, name, response, created_by: createdBy };
    if (existing) {
      Object.assign(existing, command);
    } else {
      state.customCommands.push(command);
    }
    saveState();
    return Boolean(existing);
  },
  removeCustomCommand(guildId, name) {
    const commandIndex = state.customCommands.findIndex(
      (command) => command.guild_id === guildId && command.name === name,
    );
    if (commandIndex === -1) return undefined;
    const [removedCommand] = state.customCommands.splice(commandIndex, 1);
    saveState();
    return removedCommand;
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
  addModerationCase(guildId, details) {
    const id = state.nextModerationCaseIds[guildId] || 1;
    state.nextModerationCaseIds[guildId] = id + 1;
    const moderationCase = {
      id,
      guild_id: guildId,
      ...details,
      created_at: new Date().toISOString(),
    };
    state.moderationCases[guildId] ||= [];
    state.moderationCases[guildId].push(moderationCase);
    saveState();
    return moderationCase;
  },
  getModerationCase(guildId, caseId) {
    return (state.moderationCases[guildId] || []).find((moderationCase) => moderationCase.id === caseId);
  },
  listWarnings(guildId, userId) {
    return (state.moderationCases[guildId] || [])
      .filter((moderationCase) => moderationCase.action === 'warn' && moderationCase.target_id === userId)
      .sort((first, second) => first.id - second.id);
  },
  removeWarning(guildId, caseId) {
    const cases = state.moderationCases[guildId] || [];
    const caseIndex = cases.findIndex(
      (moderationCase) => moderationCase.guild_id === guildId
        && moderationCase.id === caseId
        && moderationCase.action === 'warn',
    );
    if (caseIndex === -1) return false;
    cases.splice(caseIndex, 1);
    saveState();
    return true;
  },
  clearWarnings(guildId, userId) {
    const cases = state.moderationCases[guildId] || [];
    const remaining = cases.filter((moderationCase) => (
      moderationCase.action !== 'warn' || moderationCase.target_id !== userId
    ));
    const removedCount = cases.length - remaining.length;
    if (removedCount > 0) {
      state.moderationCases[guildId] = remaining;
      saveState();
    }
    return removedCount;
  },
  getPrefix(guildId) {
    return state.prefixes[guildId] || '!';
  },
  getLoggingChannel(guildId) {
    return state.loggingChannels[guildId];
  },
  isLoggingEnabled(guildId) {
    return Boolean(state.loggingChannels[guildId]) && state.loggingEnabled[guildId] !== false;
  },
  setLoggingChannel(guildId, channelId) {
    state.loggingChannels[guildId] = channelId;
    state.loggingEnabled[guildId] = true;
    saveState();
  },
  setLoggingEnabled(guildId, enabled) {
    state.loggingEnabled[guildId] = enabled;
    saveState();
  },
  isLoggingTypeEnabled(guildId, type) {
    return state.loggingTypes[guildId]?.[type] !== false;
  },
  getLoggingTypes(guildId) {
    return { ...state.loggingTypes[guildId] };
  },
  setLoggingTypeEnabled(guildId, type, enabled) {
    state.loggingTypes[guildId] ||= {};
    state.loggingTypes[guildId][type] = enabled;
    saveState();
  },
  removeLoggingChannel(guildId) {
    if (!state.loggingChannels[guildId]) return false;
    delete state.loggingChannels[guildId];
    delete state.loggingEnabled[guildId];
    delete state.loggingTypes[guildId];
    saveState();
    return true;
  },
  getConfessionChannel(guildId) {
    return state.confessionChannels[guildId];
  },
  setConfessionChannel(guildId, channelId) {
    state.confessionChannels[guildId] = channelId;
    saveState();
  },
  removeConfessionChannel(guildId) {
    if (!state.confessionChannels[guildId]) return false;
    delete state.confessionChannels[guildId];
    saveState();
    return true;
  },
  nextConfessionId(guildId) {
    const nextId = (state.nextConfessionIds[guildId] || 0) + 1;
    state.nextConfessionIds[guildId] = nextId;
    saveState();
    return nextId;
  },
  nextConfessionReplyNumber(messageId) {
    const nextNumber = (state.nextConfessionReplyNumbers[messageId] || 1) + 1;
    state.nextConfessionReplyNumbers[messageId] = nextNumber;
    saveState();
    return nextNumber;
  },
  getConfessionThread(messageId) {
    return state.confessionThreads[messageId];
  },
  setConfessionThread(messageId, threadId, confessionId) {
    state.confessionThreads[messageId] = { thread_id: threadId, confession_id: confessionId };
    saveState();
  },
  getAutoRole(guildId) {
    return this.getAutoRoles(guildId)[0];
  },
  getAutoRoles(guildId) {
    const roles = state.autoRoles[guildId];
    if (!roles) return [];
    return Array.isArray(roles) ? [...roles] : [roles];
  },
  setAutoRole(guildId, roleId) {
    state.autoRoles[guildId] = [roleId];
    saveState();
  },
  addAutoRole(guildId, roleId) {
    const roles = this.getAutoRoles(guildId);
    if (roles.includes(roleId)) return false;
    roles.push(roleId);
    state.autoRoles[guildId] = roles;
    saveState();
    return true;
  },
  removeAutoRoleById(guildId, roleId) {
    const roles = this.getAutoRoles(guildId);
    const remaining = roles.filter((configuredRoleId) => configuredRoleId !== roleId);
    if (remaining.length === roles.length) return false;
    if (remaining.length) state.autoRoles[guildId] = remaining;
    else delete state.autoRoles[guildId];
    saveState();
    return true;
  },
  removeAutoRole(guildId) {
    if (!state.autoRoles[guildId]) return false;
    delete state.autoRoles[guildId];
    saveState();
    return true;
  },
  getLevelingSettings(guildId) {
    return {
      enabled: false,
      xp_min: 15,
      xp_max: 25,
      cooldown_seconds: 60,
      announcement_channel_id: null,
      reward_roles: [],
      ...state.levelingSettings[guildId],
    };
  },
  updateLevelingSettings(guildId, updates) {
    state.levelingSettings[guildId] = {
      ...this.getLevelingSettings(guildId),
      ...updates,
    };
    saveState();
    return this.getLevelingSettings(guildId);
  },
  setLevelReward(guildId, level, roleId) {
    const settings = this.getLevelingSettings(guildId);
    const rewards = settings.reward_roles.filter((reward) => reward.level !== level);
    rewards.push({ level, role_id: roleId });
    rewards.sort((first, second) => first.level - second.level);
    return this.updateLevelingSettings(guildId, { reward_roles: rewards });
  },
  removeLevelReward(guildId, level) {
    const settings = this.getLevelingSettings(guildId);
    const rewards = settings.reward_roles.filter((reward) => reward.level !== level);
    if (rewards.length === settings.reward_roles.length) return false;
    this.updateLevelingSettings(guildId, { reward_roles: rewards });
    return true;
  },
  getLevelingProfile(guildId, userId) {
    return state.levelingUsers[`${guildId}:${userId}`] || { guild_id: guildId, user_id: userId, total_xp: 0 };
  },
  addLevelingXp(guildId, userId, now = Date.now()) {
    const settings = this.getLevelingSettings(guildId);
    if (!settings.enabled) return undefined;

    const key = `${guildId}:${userId}`;
    const previous = state.levelingUsers[key] || { guild_id: guildId, user_id: userId, total_xp: 0 };
    if (previous.last_awarded_at !== undefined
      && now - previous.last_awarded_at < settings.cooldown_seconds * 1000) return undefined;

    const amount = settings.xp_min + Math.floor(Math.random() * (settings.xp_max - settings.xp_min + 1));
    const oldLevel = levelForXp(previous.total_xp);
    const totalXp = previous.total_xp + amount;
    const newLevel = levelForXp(totalXp);
    const profile = {
      ...previous,
      total_xp: totalXp,
      last_awarded_at: now,
    };
    state.levelingUsers[key] = profile;
    saveState();
    return { amount, total_xp: totalXp, old_level: oldLevel, level: newLevel, leveled_up: newLevel > oldLevel };
  },
  listLevelingLeaderboard(guildId, limit = 10) {
    const prefix = `${guildId}:`;
    return Object.entries(state.levelingUsers)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, profile]) => profile)
      .sort((first, second) => second.total_xp - first.total_xp)
      .slice(0, limit);
  },
  setPrefix(guildId, prefix) {
    state.prefixes[guildId] = prefix;
    saveState();
  },
  getAntiRaid(guildId) {
    return state.antiRaidSettings[guildId];
  },
  setAntiRaid(guildId, settings) {
    state.antiRaidSettings[guildId] = settings;
    saveState();
  },
  removeAntiRaid(guildId) {
    if (!state.antiRaidSettings[guildId]) return false;
    delete state.antiRaidSettings[guildId];
    saveState();
    return true;
  },
  getHoneypot(channelId) {
    return state.honeypots[channelId];
  },
  setHoneypot(channelId, settings) {
    state.honeypots[channelId] = settings;
    saveState();
  },
  removeHoneypot(channelId) {
    if (!state.honeypots[channelId]) return false;
    delete state.honeypots[channelId];
    saveState();
    return true;
  },
  getQuarantine(guildId, userId) {
    return state.quarantines[guildId]?.[userId];
  },
  setQuarantine(guildId, userId, roleIds, quarantinedBy, quarantineRoleId) {
    state.quarantines[guildId] ||= {};
    state.quarantines[guildId][userId] = {
      role_ids: roleIds,
      quarantined_by: quarantinedBy,
      quarantine_role_id: quarantineRoleId,
    };
    saveState();
  },
  removeQuarantine(guildId, userId) {
    if (!state.quarantines[guildId]?.[userId]) return undefined;
    const quarantine = state.quarantines[guildId][userId];
    delete state.quarantines[guildId][userId];
    if (Object.keys(state.quarantines[guildId]).length === 0) delete state.quarantines[guildId];
    saveState();
    return quarantine;
  },
  getLockdown(channelId) {
    return state.lockdowns[channelId];
  },
  listLockdowns() {
    return Object.entries(state.lockdowns).map(([channelId, lockdown]) => ({ channel_id: channelId, ...lockdown }));
  },
  setLockdown(channelId, overwrites, expiresAt, lockedBy) {
    state.lockdowns[channelId] = { overwrites, expires_at: expiresAt, locked_by: lockedBy };
    saveState();
  },
  removeLockdown(channelId) {
    if (!state.lockdowns[channelId]) return false;
    delete state.lockdowns[channelId];
    saveState();
    return true;
  },
  setTemporaryMute(guildId, userId, expiresAt) {
    state.temporaryMutes[`${guildId}:${userId}`] = {
      guild_id: guildId,
      user_id: userId,
      expires_at: expiresAt,
    };
    saveState();
  },
  removeTemporaryMute(guildId, userId) {
    const key = `${guildId}:${userId}`;
    if (!state.temporaryMutes[key]) return false;
    delete state.temporaryMutes[key];
    saveState();
    return true;
  },
  listTemporaryMutes() {
    return Object.values(state.temporaryMutes);
  },
};