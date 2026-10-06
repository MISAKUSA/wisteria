const { getLevelProgress } = require('./leveling-utils');

async function processLevelingMessage(message, database) {
  const award = database.addLevelingXp(message.guildId, message.author.id);
  if (!award) return;

  const settings = database.getLevelingSettings(message.guildId);
  if (award.level > 0) {
    const reward = settings.reward_roles
      .filter((entry) => entry.level <= award.level)
      .sort((first, second) => second.level - first.level)[0];
    if (reward) {
      const role = message.guild.roles.cache.get(reward.role_id);
      if (!role) {
        console.error(`Configured leveling reward role ${reward.role_id} was not found in server ${message.guildId}.`);
      } else if (!message.member?.roles?.cache) {
        console.error(`Could not apply leveling reward role ${role.id}: member ${message.author.id} is unavailable.`);
      } else if (!message.member.roles.cache.has(role.id)) {
        const lowerRewardRoleIds = settings.reward_roles
          .filter((entry) => entry.level < reward.level && message.member.roles.cache.has(entry.role_id))
          .map((entry) => entry.role_id);
        try {
          if (lowerRewardRoleIds.length) await message.member.roles.remove(lowerRewardRoleIds);
          await message.member.roles.add(role);
        } catch (error) {
          console.error(`Could not apply leveling reward role ${role.id} to member ${message.author.id}:`, error);
        }
      }
    }
  }

  if (!award.leveled_up) return;

  const targetChannel = settings.announcement_channel_id
    ? message.guild.channels.cache.get(settings.announcement_channel_id)
      || await message.guild.channels.fetch(settings.announcement_channel_id)
    : message.channel;
  if (!targetChannel?.isTextBased() || !targetChannel.send) {
    console.error(`Could not announce level-up for member ${message.author.id} in server ${message.guildId}: announcement channel is unavailable.`);
    return;
  }

  const progress = getLevelProgress(award.total_xp);
  await targetChannel.send({
    content: `**${message.member?.displayName || message.author.globalName || message.author.username}** reached level ${progress.level}!`,
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Could not announce level-up for member ${message.author.id}:`, error);
  });
}

module.exports = { processLevelingMessage };
