const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const maximumTimeout = 28 * 24 * 60 * 60 * 1000;
const maximumTimerDelay = 2_147_000_000;
const joinTimesByGuild = new Map();
const alertTimesByGuild = new Map();
const activeTimers = new Map();

const permissionByAction = {
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  mute: PermissionFlagsBits.MuteMembers,
  unmute: PermissionFlagsBits.MuteMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  softban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
  purge: PermissionFlagsBits.ManageMessages,
  clear: PermissionFlagsBits.ManageMessages,
  slowmode: PermissionFlagsBits.ManageChannels,
  lock: PermissionFlagsBits.ManageChannels,
  unlock: PermissionFlagsBits.ManageChannels,
  lockdown: PermissionFlagsBits.ManageChannels,
  warnings: PermissionFlagsBits.ModerateMembers,
  clearwarn: PermissionFlagsBits.ModerateMembers,
  note: PermissionFlagsBits.ModerateMembers,
  case: PermissionFlagsBits.ModerateMembers,
  nuke: PermissionFlagsBits.ManageChannels,
  clone: PermissionFlagsBits.ManageChannels,
  antiraid: PermissionFlagsBits.ManageGuild,
  massban: PermissionFlagsBits.BanMembers,
  quarantine: PermissionFlagsBits.ManageRoles,
  unquarantine: PermissionFlagsBits.ManageRoles,
  honeypot: PermissionFlagsBits.ManageGuild,
  vmute: PermissionFlagsBits.MuteMembers,
  vdeafen: PermissionFlagsBits.DeafenMembers,
  vdisconnect: PermissionFlagsBits.MoveMembers,
  vmove: PermissionFlagsBits.MoveMembers,
  role: PermissionFlagsBits.ManageRoles,
  nick: PermissionFlagsBits.ManageNicknames,
  prefix: PermissionFlagsBits.ManageGuild,
};

const optionSpecs = {
  warn: [['user', 'user', true], ['reason', 'string', true]],
  timeout: [['user', 'user', true], ['duration', 'string', true], ['reason', 'string', true]],
  mute: [['user', 'user', true], ['duration', 'string', true], ['reason', 'string', true]],
  unmute: [['user', 'user', true], ['reason', 'string', false]],
  kick: [['user', 'user', true], ['reason', 'string', true]],
  ban: [['user', 'user', true], ['reason', 'string', true], ['delete_days', 'integer', false]],
  softban: [['user', 'user', true], ['reason', 'string', true]],
  unban: [['user_id', 'string', true], ['reason', 'string', false]],
  purge: [['amount', 'integer', true], ['user', 'user', false]],
  clear: [['amount', 'integer', true], ['safe', 'boolean', false]],
  slowmode: [['seconds', 'integer', true]],
  lock: [['channel', 'channel', false], ['reason', 'string', false]],
  unlock: [['channel', 'channel', false]],
  lockdown: [['duration', 'string', false]],
  warnings: [['user', 'user', true]],
  clearwarn: [['user', 'user', true], ['case_id', 'integer', false]],
  note: [['user', 'user', true], ['text', 'string', true]],
  case: [['case_id', 'integer', true]],
  nuke: [['confirm', 'boolean', true]],
  clone: [['channel', 'channel', false]],
  massban: [['user_ids', 'string', true], ['reason', 'string', true]],
  quarantine: [['user', 'user', true], ['role', 'role', true], ['reason', 'string', true]],
  unquarantine: [['user', 'user', true]],
  vmute: [['user', 'user', true]],
  vdeafen: [['user', 'user', true]],
  vdisconnect: [['user', 'user', true]],
  vmove: [['user', 'user', true], ['channel', 'channel', true]],
  nick: [['user', 'user', true], ['nickname', 'string', false]],
  prefix: [['action', 'string', true], ['value', 'string', false]],
  'antiraid.enable': [['threshold', 'integer', false], ['window', 'integer', false], ['alert_channel', 'channel', false]],
  'honeypot.set': [['channel', 'channel', true], ['action', 'string', true]],
  'honeypot.clear': [['channel', 'channel', true]],
  'role.add': [['user', 'user', true], ['role', 'role', true]],
  'role.remove': [['user', 'user', true], ['role', 'role', true]],
  'role.human.add': [['role', 'role', true]],
  'role.human.remove': [['role', 'role', true]],
};

function addOptions(builder, specs, actionName) {
  for (const [name, type, required] of specs) {
    const description = {
      user: 'The server member.',
      reason: 'Why this moderation action is being taken.',
      duration: 'Duration, for example 5m, 1h, or 1d.',
      delete_days: 'Number of days of recent messages to delete (0-7).',
      user_id: 'The Discord user ID to unban.',
      amount: 'Number of messages (1-100).',
      safe: 'Skip pinned messages.',
      seconds: 'Slowmode delay in seconds (0-21600).',
      channel: 'The channel to configure.',
      case_id: 'The moderation case ID.',
      text: 'The moderator-only note.',
      confirm: 'Confirm that this channel and its history will be deleted.',
      user_ids: 'Comma- or space-separated Discord user IDs (up to 100).',
      role: 'The role to assign, remove, or use for quarantine.',
      nickname: 'New nickname; leave blank to reset.',
      action: 'Use set or view.',
      value: 'The new prefix.',
      threshold: 'Join count that triggers an alert (2-100).',
      window: 'Join time window in seconds (2-300).',
    }[name] || `Value for ${name}.`;
    const optionMethod = {
      user: 'addUserOption',
      role: 'addRoleOption',
      channel: 'addChannelOption',
      integer: 'addIntegerOption',
      boolean: 'addBooleanOption',
      string: 'addStringOption',
    }[type];

    builder[optionMethod]((option) => {
      option.setName(name).setDescription(description).setRequired(required);
      if (name === 'reason' || name === 'text') option.setMaxLength(500);
      if (name === 'nickname') option.setMaxLength(32);
      if (name === 'delete_days') option.setMinValue(0).setMaxValue(7);
      if (name === 'amount') option.setMinValue(1).setMaxValue(100);
      if (name === 'seconds') option.setMinValue(0).setMaxValue(21600);
      if (name === 'threshold') option.setMinValue(2).setMaxValue(100);
      if (name === 'window') option.setMinValue(2).setMaxValue(300);
      if (name === 'action') {
        const choices = actionName === 'prefix'
          ? [{ name: 'Set', value: 'set' }, { name: 'View', value: 'view' }]
          : [{ name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' }];
        option.addChoices(...choices);
      }
      return option;
    });
  }
  return builder;
}

function buildAction(name, description, specs = optionSpecs[name], permission = permissionByAction[name]) {
  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(permission);
  return { data: addOptions(builder, specs, name), execute: executeSlash };
}

const commands = [
  buildAction('warn', 'Record a formal warning for a member.'),
  buildAction('timeout', 'Temporarily restrict a member.'),
  buildAction('mute', 'Server-mute a member in voice for a duration.'),
  buildAction('unmute', 'Remove a server mute.'),
  buildAction('kick', 'Remove a member from the server.'),
  buildAction('ban', 'Ban a user from the server.'),
  buildAction('softban', 'Ban and unban a member, deleting one day of recent messages.'),
  buildAction('unban', 'Remove a user ban by ID.'),
  buildAction('purge', 'Delete recent messages, optionally from one member.'),
  buildAction('slowmode', 'Set this channel’s slowmode delay.'),
  buildAction('lock', 'Prevent @everyone from sending messages in a channel.'),
  buildAction('unlock', 'Restore @everyone message permission in a channel.'),
  buildAction('lockdown', 'Lock every text channel, optionally for a duration.'),
  buildAction('warnings', 'View a member’s warning history.'),
  buildAction('clearwarn', 'Remove one or all warnings for a member.'),
  buildAction('note', 'Add a moderator-only note about a member.'),
  buildAction('case', 'View a moderation case.'),
  buildAction('nuke', 'Replace this text channel with a clean copy.'),
  buildAction('clone', 'Clone a channel without deleting the original.'),
  buildAction('clear', 'Delete recent messages; optionally skip pinned messages.'),
  buildAction('massban', 'Ban up to 100 user IDs.'),
  buildAction('quarantine', 'Temporarily isolate a member and save their current roles.'),
  buildAction('unquarantine', 'Restore a member’s saved roles.'),
  buildAction('vmute', 'Server-mute a member in voice.'),
  buildAction('vdeafen', 'Server-deafen a member in voice.'),
  buildAction('vdisconnect', 'Disconnect a member from voice.'),
  buildAction('vmove', 'Move a member to another voice channel.'),
  buildAction('nick', 'Change or reset a member nickname.'),
  buildAction('prefix', 'View or change the server text-command prefix.'),
  {
    data: new SlashCommandBuilder()
      .setName('antiraid')
      .setDescription('Configure join-spike detection.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => addOptions(
        subcommand.setName('enable').setDescription('Alert moderators when joins spike.'),
        optionSpecs['antiraid.enable'],
        'antiraid.enable',
      ))
      .addSubcommand((subcommand) => subcommand
        .setName('disable')
        .setDescription('Turn off join-spike alerts.')),
    execute: executeSlash,
  },
  {
    data: new SlashCommandBuilder()
      .setName('honeypot')
      .setDescription('Configure a channel that removes users who post in it.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => addOptions(
        subcommand.setName('set').setDescription('Configure a honeypot channel.'),
        optionSpecs['honeypot.set'],
        'honeypot.set',
      ))
      .addSubcommand((subcommand) => addOptions(
        subcommand.setName('clear').setDescription('Remove a honeypot setting.'),
        optionSpecs['honeypot.clear'],
        'honeypot.clear',
      )),
    execute: executeSlash,
  },
  {
    data: new SlashCommandBuilder()
      .setName('role')
      .setDescription('Manage member roles.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((subcommand) => addOptions(
        subcommand.setName('add').setDescription('Give a role to one member.'),
        optionSpecs['role.add'],
        'role.add',
      ))
      .addSubcommand((subcommand) => addOptions(
        subcommand.setName('remove').setDescription('Remove a role from one member.'),
        optionSpecs['role.remove'],
        'role.remove',
      ))
      .addSubcommandGroup((group) => group
        .setName('human')
        .setDescription('Manage a role for every human member.')
        .addSubcommand((subcommand) => addOptions(
          subcommand.setName('add').setDescription('Give the role to all human members.'),
          optionSpecs['role.human.add'],
          'role.human.add',
        ))
        .addSubcommand((subcommand) => addOptions(
          subcommand.setName('remove').setDescription('Remove the role from all human members.'),
          optionSpecs['role.human.remove'],
          'role.human.remove',
        ))),
    execute: executeSlash,
  },
];

function parseDuration(value) {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+)\s*(s|sec|m|min|h|hr|d|day|w|week)s?$/i.exec(value.trim());
  if (!match) return undefined;
  const units = { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, hr: 3600000, d: 86400000, day: 86400000, w: 604800000, week: 604800000 };
  const duration = Number(match[1]) * units[match[2].toLowerCase()];
  return Number.isSafeInteger(duration) && duration > 0 ? duration : undefined;
}

function caseDetails(action, targetId, targetLabel, moderatorId, reason, details = {}) {
  return {
    action,
    target_id: targetId,
    target_label: targetLabel,
    moderator_id: moderatorId,
    reason: reason || 'No reason provided.',
    ...details,
  };
}

function hasPermission(context, permission) {
  return context.memberPermissions?.has(permission) || false;
}

function checkMemberHierarchy(context, target, moderatorMember) {
  if (!target || target.guild.id !== context.guild.id) return 'Choose a member in this server.';
  if (target.id === context.guild.ownerId) return 'The server owner cannot be moderated.';
  if (target.id === context.user.id) return 'You cannot use this command on yourself.';
  if (target.roles.highest.comparePositionTo(moderatorMember.roles.highest) >= 0
    && context.user.id !== context.guild.ownerId) {
    return 'Your highest role must be above the target member’s highest role.';
  }
  if (!target.manageable) return 'My highest role must be above the target member’s highest role.';
  return undefined;
}

function checkRoleHierarchy(context, role) {
  if (!role || role.guild.id !== context.guild.id || !role.editable) {
    return 'Choose a role below my highest role.';
  }
  if (context.user.id !== context.guild.ownerId
    && role.comparePositionTo(context.member.roles.highest) >= 0) {
    return 'Your highest role must be above the role you want to manage.';
  }
  return undefined;
}

async function resolveMember(context, user) {
  if (!user) return undefined;
  return context.guild.members.cache.get(user.id) || context.guild.members.fetch(user.id).catch((error) => {
    if (error.code === 10007 || error.code === 10013) return undefined;
    throw error;
  });
}

async function reply(context, content) {
  return context.reply(content);
}

async function addCase(context, action, target, reason, extra = {}) {
  return context.database.addModerationCase(
    context.guild.id,
    caseDetails(action, target.id, target.user?.tag || target.tag || target.username, context.user.id, reason, extra),
  );
}

async function notifyUser(user, content) {
  try {
    await user.send(content);
  } catch (error) {
    console.warn(`Could not DM moderation notice to ${user.id}:`, error.message);
  }
}

function resolveDuration(context, raw) {
  const duration = parseDuration(raw);
  if (!duration || duration > maximumTimeout) {
    return { error: 'Use a duration such as 5m, 1h, or 1d (maximum 28 days).' };
  }
  return { duration };
}

async function restoreLockdownChannel(channel, database, reason = 'Lockdown ended') {
  const record = database.getLockdown(channel.id);
  if (!record) return false;
  const previous = record.overwrites;
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: previous.send_messages,
    SendMessagesInThreads: previous.send_messages_in_threads,
  }, { reason });
  database.removeLockdown(channel.id);
  const timer = activeTimers.get(`lock:${channel.id}`);
  if (timer) clearTimeout(timer);
  activeTimers.delete(`lock:${channel.id}`);
  return true;
}

function scheduleAt(key, expiresAt, callback) {
  const oldTimer = activeTimers.get(key);
  if (oldTimer) clearTimeout(oldTimer);
  const schedule = () => {
    const remaining = expiresAt - Date.now();
    const timer = setTimeout(() => {
      if (remaining > maximumTimerDelay) schedule();
      else callback().catch((error) => console.error(`Could not complete scheduled moderation action ${key}:`, error));
    }, Math.min(Math.max(remaining, 0), maximumTimerDelay));
    timer.unref?.();
    activeTimers.set(key, timer);
  };
  schedule();
}

async function lockChannel(channel, database, moderatorId, expiresAt, reason = 'Server lockdown') {
  const everyoneRole = channel.guild.roles.everyone;
  if (!everyoneRole) throw new Error('Could not find the @everyone role for this server.');
  const currentOverwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
  const existingRecord = database.getLockdown(channel.id);
  const previous = existingRecord?.overwrites || {
    send_messages: currentOverwrite?.allow.has(PermissionFlagsBits.SendMessages)
      ? true
      : currentOverwrite?.deny.has(PermissionFlagsBits.SendMessages) ? false : null,
    send_messages_in_threads: currentOverwrite?.allow.has(PermissionFlagsBits.SendMessagesInThreads)
      ? true
      : currentOverwrite?.deny.has(PermissionFlagsBits.SendMessagesInThreads) ? false : null,
  };
  await channel.permissionOverwrites.edit(everyoneRole, {
    SendMessages: false,
    SendMessagesInThreads: false,
  }, { reason });
  database.setLockdown(channel.id, previous, expiresAt, moderatorId);
  if (expiresAt) {
    scheduleAt(`lock:${channel.id}`, expiresAt, () => restoreLockdownChannel(channel, database));
  }
}

async function executeAction(action, context) {
  const values = context.values;
  const database = context.database;
  const reason = values.reason || 'No reason provided.';
  const user = values.user;
  const moderatorMember = context.guild.members.cache.get(context.user.id)
    || await context.guild.members.fetch(context.user.id);
  context.member = moderatorMember;
  const target = user ? await resolveMember(context, user) : undefined;
  const hierarchyError = target && checkMemberHierarchy(context, target, moderatorMember);
  if (hierarchyError) return reply(context, hierarchyError);

  if (['warn', 'timeout', 'mute', 'kick', 'unmute', 'vmute', 'vdeafen', 'vdisconnect', 'vmove', 'role.add', 'role.remove', 'quarantine', 'unquarantine', 'nick'].includes(action) && !target) {
    return reply(context, 'That user is not a member of this server.');
  }

  if (action === 'warn') {
    const moderationCase = await addCase(context, 'warn', target, reason);
    await notifyUser(target.user, `You received a warning in **${context.guild.name}**: ${reason}`);
    return reply(context, `Warning recorded for ${target.user.tag} as case #${moderationCase.id}.`);
  }

  if (action === 'timeout') {
    const parsed = resolveDuration(context, values.duration);
    if (parsed.error) return reply(context, parsed.error);
    await target.timeout(parsed.duration, reason);
    const moderationCase = await addCase(context, 'timeout', target, reason, { duration_ms: parsed.duration });
    await notifyUser(target.user, `You were timed out in **${context.guild.name}**: ${reason}`);
    return reply(context, `${target.user.tag} was timed out as case #${moderationCase.id}.`);
  }

  if (action === 'mute' || action === 'vmute') {
    if (!target.voice.channel) return reply(context, `${target.user.tag} is not in a voice channel.`);
    const duration = action === 'mute' ? resolveDuration(context, values.duration) : undefined;
    if (duration?.error) return reply(context, duration.error);
    await target.voice.setMute(true, reason);
    if (duration) {
      const expiresAt = Date.now() + duration.duration;
      database.setTemporaryMute(context.guild.id, target.id, expiresAt);
      scheduleAt(`mute:${context.guild.id}:${target.id}`, expiresAt, async () => {
        const currentMember = await context.guild.members.fetch(target.id);
        if (currentMember.voice.serverMute) await currentMember.voice.setMute(false, 'Temporary mute expired');
        database.removeTemporaryMute(context.guild.id, target.id);
      });
    }
    const moderationCase = await addCase(context, 'mute', target, reason, duration ? { duration_ms: duration.duration } : {});
    return reply(context, `Server-muted ${target.user.tag}${duration ? ` for ${values.duration}` : ''} as case #${moderationCase.id}.`);
  }

  if (action === 'unmute') {
    await target.voice.setMute(false, reason);
    database.removeTemporaryMute(context.guild.id, target.id);
    const moderationCase = await addCase(context, 'unmute', target, reason);
    return reply(context, `Server mute removed from ${target.user.tag} as case #${moderationCase.id}.`);
  }

  if (action === 'kick') {
    await target.kick(reason);
    const moderationCase = await addCase(context, action, target, reason);
    return reply(context, `${target.user.tag} was kicked as case #${moderationCase.id}.`);
  }

  if (action === 'ban' || action === 'softban') {
    const deleteDays = action === 'softban' ? 1 : (values.delete_days || 0);
    await context.guild.members.ban(user.id, { deleteMessageSeconds: deleteDays * 86400, reason });
    if (action === 'softban') await context.guild.members.unban(user.id, 'Softban complete');
    const moderationCase = await addCase(context, action, user, reason, { delete_days: deleteDays });
    return reply(context, `${user.tag} was ${action === 'softban' ? 'softbanned' : 'banned'} as case #${moderationCase.id}.`);
  }

  if (action === 'unban') {
    if (!/^\d{17,20}$/.test(values.user_id)) return reply(context, 'Provide a valid Discord user ID.');
    const unbannedUser = await context.guild.members.unban(values.user_id, reason);
    const moderationCase = await addCase(context, 'unban', unbannedUser, reason);
    return reply(context, `Unbanned ${unbannedUser.tag} as case #${moderationCase.id}.`);
  }

  if (action === 'purge' || action === 'clear') {
    if (!Number.isInteger(values.amount) || values.amount < 1 || values.amount > 100) {
      return reply(context, 'Choose an amount from 1 to 100.');
    }
    const messages = await context.channel.messages.fetch({ limit: 100 });
    const selected = [...messages.values()]
      .filter((message) => !values.user || message.author.id === values.user.id)
      .filter((message) => !(action === 'clear' && values.safe && message.pinned))
      .slice(0, values.amount);
    if (selected.length === 0) return reply(context, 'No matching messages were found.');
    const deleted = await context.channel.bulkDelete(selected, true);
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      action, context.channel.id, context.channel.name, context.user.id,
      `Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'}`,
      { deleted_count: deleted.size, target_id: values.user?.id || context.channel.id },
    ));
    return reply(context, `Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'} as case #${moderationCase.id}.`);
  }

  if (action === 'slowmode') {
    if (!Number.isInteger(values.seconds) || values.seconds < 0 || values.seconds > 21600) {
      return reply(context, 'Slowmode must be from 0 to 21600 seconds.');
    }
    await context.channel.setRateLimitPerUser(values.seconds, 'Slowmode changed by moderator');
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      action, context.channel.id, context.channel.name, context.user.id, `Slowmode set to ${values.seconds} seconds`,
    ));
    return reply(context, `${values.seconds ? `Slowmode set to ${values.seconds} seconds` : 'Slowmode disabled'} as case #${moderationCase.id}.`);
  }

  if (action === 'lock' || action === 'unlock') {
    const channel = values.channel || context.channel;
    if (channel.guildId !== context.guild.id || !channel.permissionOverwrites) return reply(context, 'Choose a text channel in this server.');
    if (action === 'lock') {
      await lockChannel(channel, database, context.user.id, null, reason);
      const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
        action, channel.id, channel.name, context.user.id, reason,
      ));
      return reply(context, `Locked <#${channel.id}> as case #${moderationCase.id}. ${reason}`);
    }
    if (!database.getLockdown(channel.id)) {
      const current = channel.permissionOverwrites.cache.get(context.guild.roles.everyone.id);
      database.setLockdown(channel.id, {
        send_messages: current?.allow.has(PermissionFlagsBits.SendMessages) ? true : current?.deny.has(PermissionFlagsBits.SendMessages) ? false : null,
        send_messages_in_threads: current?.allow.has(PermissionFlagsBits.SendMessagesInThreads) ? true : current?.deny.has(PermissionFlagsBits.SendMessagesInThreads) ? false : null,
      }, null, context.user.id);
    }
    await restoreLockdownChannel(channel, database, reason);
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      action, channel.id, channel.name, context.user.id, reason,
    ));
    return reply(context, `Unlocked <#${channel.id}> as case #${moderationCase.id}.`);
  }

  if (action === 'lockdown') {
    const duration = values.duration ? resolveDuration(context, values.duration) : undefined;
    if (duration?.error) return reply(context, duration.error);
    const expiresAt = duration ? Date.now() + duration.duration : null;
    const channels = [...context.guild.channels.cache.values()].filter((channel) => (
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
      && context.guild.members.me
      && channel.permissionsFor(context.guild.members.me)?.has(PermissionFlagsBits.ManageChannels)
    ));
    const lockedChannels = [];
    for (const channel of channels) {
      try {
        await lockChannel(channel, database, context.user.id, expiresAt);
        lockedChannels.push(channel);
      } catch (error) {
        console.error(`Could not lock channel ${channel.id} during server lockdown:`, error);
      }
    }
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      'lockdown', context.guild.id, context.guild.name, context.user.id,
      duration ? `Lockdown for ${values.duration}` : 'Indefinite lockdown',
      { channel_ids: lockedChannels.map((channel) => channel.id), expires_at: expiresAt },
    ));
    return reply(context, `Locked ${lockedChannels.length} of ${channels.length} text channels${duration ? ` for ${values.duration}` : ''} as case #${moderationCase.id}.`);
  }

  if (action === 'warnings') {
    const warnings = database.listWarnings(context.guild.id, user.id);
    if (!warnings.length) return reply(context, `No warnings found for ${user.tag}.`);
    const text = warnings.map((entry) => `#${entry.id} (${entry.created_at}): ${entry.reason}`).join('\n');
    return reply(context, `Warnings for ${user.tag}:\n${text}`.slice(0, 1900));
  }

  if (action === 'clearwarn') {
    if (values.case_id !== undefined) {
      const entry = database.getModerationCase(context.guild.id, values.case_id);
      if (!entry || entry.action !== 'warn' || entry.target_id !== user.id) return reply(context, 'That warning case was not found for this member.');
      database.removeWarning(context.guild.id, values.case_id);
      return reply(context, `Warning case #${values.case_id} cleared.`);
    }
    const removed = database.clearWarnings(context.guild.id, user.id);
    return reply(context, `Cleared ${removed} warning${removed === 1 ? '' : 's'} for ${user.tag}.`);
  }

  if (action === 'note') {
    const id = database.addNote(context.guild.id, user.id, context.user.id, values.text);
    return reply(context, `Moderator note #${id} added for ${user.tag}.`);
  }

  if (action === 'case') {
    if (!Number.isInteger(values.case_id) || values.case_id < 1) return reply(context, 'Provide a valid case ID.');
    const entry = database.getModerationCase(context.guild.id, values.case_id);
    if (!entry) return reply(context, `Case #${values.case_id} was not found.`);
    return reply(context, `Case #${entry.id} — ${entry.action}\nTarget: ${entry.target_label} (${entry.target_id})\nModerator: <@${entry.moderator_id}>\nReason: ${entry.reason}\nDate: ${entry.created_at}`);
  }

  if (action === 'nuke') {
    const channel = context.channel;
    if (!values.confirm) return reply(context, 'Nuke cancelled. Set confirm to true to clone and delete this channel.');
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return reply(context, 'Nuke can only be used in a text or announcement channel.');
    }
    const replacement = await channel.clone({ reason: `Channel nuke by ${context.user.tag}` });
    try {
      await channel.delete(`Channel nuked by ${context.user.tag}`);
    } catch (error) {
      await replacement.delete('Original channel could not be deleted');
      throw error;
    }
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      action, channel.id, channel.name, context.user.id, 'Channel recreated and history deleted',
      { replacement_channel_id: replacement.id },
    ));
    return reply(context, `Channel recreated: <#${replacement.id}> as case #${moderationCase.id}.`);
  }

  if (action === 'clone') {
    const channel = values.channel || context.channel;
    if (channel.guildId !== context.guild.id) return reply(context, 'Choose a channel in this server.');
    const cloned = await channel.clone({ reason: `Channel clone by ${context.user.tag}` });
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      action, channel.id, channel.name, context.user.id, `Channel cloned as ${cloned.id}`,
    ));
    return reply(context, `Channel cloned: <#${cloned.id}> as case #${moderationCase.id}.`);
  }

  if (action === 'massban') {
    const ids = [...new Set((values.user_ids || '').split(/[,\s]+/).filter(Boolean))];
    if (ids.length === 0 || ids.length > 100 || ids.some((id) => !/^\d{17,20}$/.test(id))) {
      return reply(context, 'Provide 1-100 valid Discord user IDs.');
    }
    let bannedCount = 0;
    const failedIds = [];
    for (const id of ids) {
      try {
        const bannedUser = await context.guild.members.ban(id, { reason });
        bannedCount += 1;
        await addCase(context, 'massban', bannedUser || { id, username: id }, reason);
      } catch (error) {
        failedIds.push(id);
        console.error(`Could not mass-ban user ${id} in server ${context.guild.id}:`, error);
      }
    }
    return reply(context, `Banned ${bannedCount} of ${ids.length} users${failedIds.length ? `. Failed IDs: ${failedIds.join(', ')}` : ''}.`);
  }

  if (action === 'quarantine') {
    const role = values.role;
    const roleError = checkRoleHierarchy(context, role);
    if (roleError) return reply(context, roleError);
    const oldRoleIds = target.roles.cache
      .filter((memberRole) => memberRole.id !== context.guild.id && memberRole.editable)
      .map((memberRole) => memberRole.id);
    const rolesToRemove = oldRoleIds.filter((id) => id !== role.id);
    if (!database.getQuarantine(context.guild.id, target.id)) {
      database.setQuarantine(context.guild.id, target.id, oldRoleIds, context.user.id, role.id);
    }
    await target.roles.remove(rolesToRemove, reason);
    await target.roles.add(role, reason);
    const moderationCase = await addCase(context, 'quarantine', target, reason, { quarantine_role_id: role.id });
    return reply(context, `${target.user.tag} was quarantined as case #${moderationCase.id}.`);
  }

  if (action === 'unquarantine') {
    const quarantine = database.getQuarantine(context.guild.id, target.id);
    if (!quarantine) return reply(context, `${target.user.tag} does not have a saved quarantine role set.`);
    const quarantineRole = context.guild.roles.cache.get(quarantine.quarantine_role_id);
    if (quarantineRole?.editable && target.roles.cache.has(quarantineRole.id)) {
      await target.roles.remove(quarantineRole, 'Member released from quarantine');
    }
    const roles = quarantine.role_ids
      .map((roleId) => context.guild.roles.cache.get(roleId))
      .filter((role) => role?.editable);
    if (roles.length) await target.roles.add(roles, 'Member released from quarantine');
    database.removeQuarantine(context.guild.id, target.id);
    const moderationCase = await addCase(context, 'unquarantine', target, 'Restored saved roles');
    return reply(context, `${target.user.tag} was released from quarantine as case #${moderationCase.id}.`);
  }

  if (action === 'vmute' || action === 'vdeafen') {
    if (!target.voice.channel) return reply(context, `${target.user.tag} is not in a voice channel.`);
    if (action === 'vmute') await target.voice.setMute(true, reason);
    else await target.voice.setDeaf(true, reason);
    const moderationCase = await addCase(context, action, target, reason);
    return reply(context, `${target.user.tag} was ${action === 'vmute' ? 'server-muted' : 'server-deafened'} as case #${moderationCase.id}.`);
  }

  if (action === 'vdisconnect') {
    if (!target.voice.channel) return reply(context, `${target.user.tag} is not in a voice channel.`);
    await target.voice.disconnect(reason);
    const moderationCase = await addCase(context, action, target, reason);
    return reply(context, `${target.user.tag} was disconnected from voice as case #${moderationCase.id}.`);
  }

  if (action === 'vmove') {
    const channel = values.channel;
    if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
      return reply(context, 'Choose a voice or stage channel.');
    }
    if (!target.voice.channel) return reply(context, `${target.user.tag} is not connected to voice.`);
    await target.voice.setChannel(channel, reason);
    const moderationCase = await addCase(context, action, target, reason, { channel_id: channel.id });
    return reply(context, `Moved ${target.user.tag} to <#${channel.id}> as case #${moderationCase.id}.`);
  }

  if (action === 'role.add' || action === 'role.remove') {
    const role = values.role;
    const roleError = checkRoleHierarchy(context, role);
    if (roleError) return reply(context, roleError);
    if (action === 'role.add') await target.roles.add(role, 'Role updated by moderator');
    else await target.roles.remove(role, 'Role updated by moderator');
    const moderationCase = await addCase(context, action, target, `Role: ${role.name}`, { role_id: role.id });
    return reply(context, `${role.name} ${action === 'role.add' ? 'added to' : 'removed from'} ${target.user.tag} as case #${moderationCase.id}.`);
  }

  if (action === 'role.human.add' || action === 'role.human.remove') {
    const role = values.role;
    const roleError = checkRoleHierarchy(context, role);
    if (roleError) return reply(context, roleError);
    const members = await context.guild.members.fetch();
    let changed = 0;
    let failed = 0;
    for (const member of members.values()) {
      if (member.user.bot || !member.manageable || member.roles.cache.has(role.id) === (action === 'role.human.add')) continue;
      try {
        if (action === 'role.human.add') await member.roles.add(role, 'Human role update by moderator');
        else await member.roles.remove(role, 'Human role update by moderator');
        changed += 1;
      } catch (error) {
        failed += 1;
        console.error(`Could not update role ${role.id} for member ${member.id}:`, error);
      }
    }
    const moderationCase = database.addModerationCase(context.guild.id, caseDetails(
      action, role.id, role.name, context.user.id, `${changed} human members updated`, { role_id: role.id },
    ));
    return reply(context, `Updated ${role.name} for ${changed} human members${failed ? `; ${failed} failed` : ''} as case #${moderationCase.id}.`);
  }

  if (action === 'nick') {
    await target.setNickname(values.nickname || null, reason);
    const moderationCase = await addCase(context, action, target, reason, { nickname: values.nickname || null });
    return reply(context, `Nickname ${values.nickname ? 'updated' : 'reset'} for ${target.user.tag} as case #${moderationCase.id}.`);
  }

  if (action === 'prefix') {
    if (values.action === 'view') return reply(context, `The current text-command prefix is \`${database.getPrefix(context.guild.id)}\`.`);
    if (values.action !== 'set') return reply(context, 'Use `prefix set <value>` or `prefix view`.');
    const prefix = values.value;
    if (!prefix || prefix.length > 5 || /\s/.test(prefix)) return reply(context, 'Choose a prefix of 1-5 non-space characters.');
    database.setPrefix(context.guild.id, prefix);
    return reply(context, `Text-command prefix set to \`${prefix}\`.`);
  }

  if (action === 'antiraid.enable') {
    const threshold = values.threshold || 10;
    const windowSeconds = values.window || 10;
    if (threshold < 2 || threshold > 100 || windowSeconds < 2 || windowSeconds > 300) {
      return reply(context, 'Set a threshold from 2-100 joins and a window from 2-300 seconds.');
    }
    const alertChannel = values.alert_channel || context.channel;
    if (alertChannel.guildId !== context.guild.id || !alertChannel.isTextBased()) return reply(context, 'Choose a text alert channel in this server.');
    if (!context.guild.members.me
      || !alertChannel.permissionsFor(context.guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
      return reply(context, 'I need permission to send messages in the anti-raid alert channel.');
    }
    database.setAntiRaid(context.guild.id, {
      enabled: true,
      threshold,
      window_seconds: windowSeconds,
      alert_channel_id: alertChannel.id,
      updated_by: context.user.id,
    });
    return reply(context, `Join-spike detection enabled: alert after ${threshold} joins in ${windowSeconds} seconds in <#${alertChannel.id}>. No users are automatically kicked or banned.`);
  }

  if (action === 'antiraid.disable') {
    const removed = database.removeAntiRaid(context.guild.id);
    return reply(context, removed ? 'Join-spike detection disabled.' : 'Join-spike detection was not enabled.');
  }

  if (action === 'honeypot.set') {
    const channel = values.channel;
    if (!channel || channel.guildId !== context.guild.id || !channel.isTextBased()) return reply(context, 'Choose a text channel in this server.');
    if (!['kick', 'ban'].includes(values.action)) return reply(context, 'Choose kick or ban for honeypot enforcement.');
    const botPermission = values.action === 'ban' ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.KickMembers;
    if (!hasPermission({ memberPermissions: context.guild.members.me?.permissions }, botPermission)) {
      return reply(context, `I need the ${values.action === 'ban' ? 'Ban Members' : 'Kick Members'} permission to enforce that honeypot action.`);
    }
    database.setHoneypot(channel.id, { action: values.action, updated_by: context.user.id });
    return reply(context, `Honeypot enabled in <#${channel.id}>. Members who post there will be ${values.action}ed.`);
  }

  if (action === 'honeypot.clear') {
    if (!values.channel || values.channel.guildId !== context.guild.id) return reply(context, 'Choose a channel in this server.');
    const removed = database.removeHoneypot(values.channel.id);
    return reply(context, removed ? `Honeypot disabled in <#${values.channel.id}>.` : 'That channel is not configured as a honeypot.');
  }

  return reply(context, 'That moderation command is not implemented.');
}

function valuesFromSlash(interaction, action) {
  const values = {};
  for (const [name, type] of optionSpecs[action] || []) {
    const getter = {
      user: 'getUser',
      role: 'getRole',
      channel: 'getChannel',
      integer: 'getInteger',
      boolean: 'getBoolean',
      string: 'getString',
    }[type];
    values[name] = interaction.options[getter](name);
  }
  return values;
}

function getSlashAction(interaction) {
  const command = interaction.commandName;
  if (command === 'role') {
    const group = interaction.options.getSubcommandGroup(false);
    return group ? `role.${group}.${interaction.options.getSubcommand()}` : `role.${interaction.options.getSubcommand()}`;
  }
  if (command === 'antiraid' || command === 'honeypot') return `${command}.${interaction.options.getSubcommand()}`;
  return command;
}

async function executeSlash(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
  }
  const action = getSlashAction(interaction);
  const requiredPermission = permissionByAction[interaction.commandName];
  if (!hasPermission(interaction, requiredPermission)) {
    return interaction.reply({ content: 'You do not have permission to use this moderation command.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return executeAction(action, {
    guild: interaction.guild,
    channel: interaction.channel,
    user: interaction.user,
    member: interaction.member,
    memberPermissions: interaction.memberPermissions,
    values: valuesFromSlash(interaction, action),
    database,
    reply: (content) => interaction.editReply({
      content,
      allowedMentions: { parse: [] },
    }),
  });
}

function tokenize(input) {
  return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
    .map((match) => match[1] ?? match[2] ?? match[3]);
}

function extractId(token) {
  return token?.match(/^<@!?(\d+)>$/)?.[1] || token?.match(/^<#(\d+)>$/)?.[1]
    || token?.match(/^<@&(\d+)>$/)?.[1] || token;
}

async function memberFromToken(guild, token) {
  const id = extractId(token);
  if (!/^\d{17,20}$/.test(id || '')) return undefined;
  return guild.members.cache.get(id) || guild.members.fetch(id).catch((error) => {
    if (error.code === 10007 || error.code === 10013) return undefined;
    throw error;
  });
}

function channelFromToken(guild, token) {
  return guild.channels.cache.get(extractId(token));
}

function roleFromToken(guild, token) {
  return guild.roles.cache.get(extractId(token));
}

function trailingText(tokens) {
  return tokens.join(' ').trim();
}

async function parsePrefix(message, commandName, input) {
  const tokens = tokenize(input);
  const values = {};
  const text = () => trailingText(tokens);
  const member = async (index = 0) => memberFromToken(message.guild, tokens[index]);
  const channel = (index = 0) => channelFromToken(message.guild, tokens[index]);
  const role = (index = 0) => roleFromToken(message.guild, tokens[index]);

  if (['warn', 'timeout', 'mute', 'kick', 'ban', 'softban', 'unmute', 'warnings', 'clearwarn', 'note', 'vmute', 'vdeafen', 'vdisconnect', 'nick', 'unquarantine'].includes(commandName)) {
    values.user = await member();
    if (!values.user && ['ban', 'softban'].includes(commandName)) {
      const userId = extractId(tokens[0]);
      if (/^\d{17,20}$/.test(userId || '')) {
        values.user = await message.client.users.fetch(userId).catch((error) => {
          if (error.code === 10013) return undefined;
          throw error;
        });
      }
    }
    tokens.shift();
    if (commandName === 'timeout' || commandName === 'mute') values.duration = tokens.shift();
    if (commandName === 'ban' && /^\d+$/.test(tokens[0] || '')) values.delete_days = Number(tokens.shift());
    if (commandName === 'clearwarn' && /^\d+$/.test(tokens[0] || '')) values.case_id = Number(tokens.shift());
    if (commandName === 'nick') values.nickname = text() || null;
    else if (commandName === 'note') values.text = text();
    else if (!['warnings', 'clearwarn'].includes(commandName)) values.reason = text() || (commandName === 'unmute' ? 'Unmuted by moderator' : '');
  } else if (commandName === 'unban') {
    values.user_id = extractId(tokens.shift());
    values.reason = text();
  } else if (commandName === 'purge' || commandName === 'clear') {
    values.amount = Number(tokens.shift());
    if (commandName === 'purge' && tokens[0]) values.user = await member();
    if (commandName === 'clear') values.safe = tokens.includes('safe');
  } else if (commandName === 'slowmode') {
    values.seconds = Number(tokens[0]);
  } else if (commandName === 'lock' || commandName === 'unlock') {
    values.channel = channel() || message.channel;
    if (values.channel !== message.channel) tokens.shift();
    values.reason = text();
  } else if (commandName === 'lockdown') {
    values.duration = tokens[0];
  } else if (commandName === 'case') {
    values.case_id = Number(tokens[0]);
  } else if (commandName === 'nuke') {
    values.confirm = tokens[0] === 'confirm';
  } else if (commandName === 'clone') {
    values.channel = tokens.length ? channel() : message.channel;
  } else if (commandName === 'massban') {
    values.user_ids = tokens.shift() || '';
    values.reason = text();
  } else if (commandName === 'quarantine') {
    values.user = await member();
    tokens.shift();
    values.role = role();
    tokens.shift();
    values.reason = text();
  } else if (commandName === 'vmove') {
    values.user = await member();
    values.channel = channel(1);
  } else if (commandName === 'prefix') {
    values.action = tokens.shift();
    values.value = tokens.shift();
  } else if (commandName === 'antiraid') {
    const subcommand = tokens.shift();
    if (subcommand === 'disable') return { action: 'antiraid.disable', values };
    if (subcommand !== 'enable') return { error: 'Use `antiraid enable [threshold] [window_seconds] [#alert-channel]` or `antiraid disable`.' };
    values.threshold = tokens[0] && /^\d+$/.test(tokens[0]) ? Number(tokens.shift()) : undefined;
    values.window = tokens[0] && /^\d+$/.test(tokens[0]) ? Number(tokens.shift()) : undefined;
    values.alert_channel = tokens[0] ? channel() : message.channel;
    return { action: 'antiraid.enable', values };
  } else if (commandName === 'honeypot') {
    const subcommand = tokens.shift();
    values.channel = channel() || message.channel;
    if (subcommand === 'clear') return { action: 'honeypot.clear', values };
    if (subcommand !== 'set') return { error: 'Use `honeypot set #channel kick|ban` or `honeypot clear #channel`.' };
    tokens.shift();
    values.action = tokens.shift();
    return { action: 'honeypot.set', values };
  } else if (commandName === 'role') {
    const subcommand = tokens.shift();
    if (subcommand === 'human') {
      const operation = tokens.shift();
      values.role = role();
      return { action: `role.human.${operation}`, values };
    }
    values.user = await member();
    tokens.shift();
    values.role = role();
    return { action: `role.${subcommand}`, values };
  } else {
    return { error: `Unknown moderation command: ${commandName}` };
  }
  return { action: commandName, values };
}

async function executePrefix(message, database, prefix, commandName, input) {
  if (!message.guild || message.author.bot) return;
  const permission = permissionByAction[commandName];
  if (!message.member?.permissions.has(permission)) {
    return message.author.send('You do not have permission to use this moderation command.');
  }
  if (commandName === 'mute') {
    const [userToken, duration, ...reason] = tokenize(input);
    const user = await memberFromToken(message.guild, userToken);
    return executePrefixAction(message, database, 'mute', {
      user: user?.user,
      duration,
      reason: reason.join(' '),
    });
  }
  const parsed = await parsePrefix(message, commandName, input);
  const action = parsed.action || commandName;
  if (parsed.error) return message.author.send(parsed.error);
  return executePrefixAction(message, database, action, parsed.values);
}

async function executePrefixAction(message, database, action, values) {
  const permission = permissionByAction[action.split('.')[0]];
  if (!message.member?.permissions.has(permission)) {
    return message.author.send('You do not have permission to use this moderation command.');
  }
  return executeAction(action, {
    guild: message.guild,
    channel: message.channel,
    user: message.author,
    member: message.member,
    memberPermissions: message.member.permissions,
    values,
    database,
    reply: (content) => message.author.send(content),
  });
}

async function handleHoneypotMessage(message, database) {
  const setting = database.getHoneypot(message.channelId);
  if (!setting || message.author.bot) return false;
  const reason = 'Posted in a configured honeypot channel.';
  if (setting.action === 'ban') {
    await message.member.ban({ reason });
  } else {
    await message.member.kick(reason);
  }
  database.addModerationCase(message.guild.id, caseDetails(
    `honeypot-${setting.action}`,
    message.author.id,
    message.author.tag,
    message.client.user.id,
    reason,
    { channel_id: message.channelId },
  ));
  return true;
}

async function handleAntiRaidJoin(member, database) {
  const setting = database.getAntiRaid(member.guild.id);
  if (!setting?.enabled) return;
  const now = Date.now();
  const joinTimes = (joinTimesByGuild.get(member.guild.id) || [])
    .filter((joinedAt) => now - joinedAt <= setting.window_seconds * 1000);
  joinTimes.push(now);
  joinTimesByGuild.set(member.guild.id, joinTimes);
  if (joinTimes.length < setting.threshold) return;
  const lastAlert = alertTimesByGuild.get(member.guild.id) || 0;
  if (now - lastAlert < setting.window_seconds * 1000) return;
  alertTimesByGuild.set(member.guild.id, now);
  const channel = member.guild.channels.cache.get(setting.alert_channel_id);
  if (!channel?.isTextBased()) {
    console.error(`Anti-raid alert channel ${setting.alert_channel_id} is unavailable in server ${member.guild.id}.`);
    return;
  }
  await channel.send({
    content: `Join spike detected: ${joinTimes.length} members joined within ${setting.window_seconds} seconds. No automatic action was taken.`,
    allowedMentions: { parse: [] },
  });
}

async function restoreTemporaryActions(client, database) {
  for (const lockdown of database.listLockdowns()) {
    const channel = await client.channels.fetch(lockdown.channel_id).catch((error) => {
      if (error.code !== 10003) throw error;
      return undefined;
    });
    if (!channel) {
      database.removeLockdown(lockdown.channel_id);
      continue;
    }
    if (lockdown.expires_at) {
      scheduleAt(`lock:${channel.id}`, lockdown.expires_at, () => restoreLockdownChannel(channel, database));
    }
  }
  for (const mute of database.listTemporaryMutes()) {
    const guild = client.guilds.cache.get(mute.guild_id);
    if (!guild) continue;
    scheduleAt(`mute:${mute.guild_id}:${mute.user_id}`, mute.expires_at, async () => {
      const member = await guild.members.fetch(mute.user_id);
      if (member.voice.serverMute) await member.voice.setMute(false, 'Temporary mute expired');
      database.removeTemporaryMute(mute.guild_id, mute.user_id);
    });
  }
}

module.exports = {
  commands,
  executePrefix,
  handleAntiRaidJoin,
  handleHoneypotMessage,
  restoreTemporaryActions,
};
