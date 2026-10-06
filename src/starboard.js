const { EmbedBuilder } = require('discord.js');

const starEmoji = '⭐';
const operationsByMessage = new Map();

function getStarCount(message) {
  return [...message.reactions.cache.values()]
    .filter((reaction) => reaction.emoji.name === starEmoji)
    .reduce((total, reaction) => total + reaction.count, 0);
}

function buildStarboardPost(message, count) {
  const attachments = [...message.attachments.values()];
  const image = attachments.find((attachment) => attachment.contentType?.startsWith('image/'));
  const linkedAttachments = attachments
    .filter((attachment) => attachment !== image)
    .map((attachment) => attachment.url);
  const content = [message.content, ...linkedAttachments].filter(Boolean).join('\n\n');
  const authorName = message.member?.displayName
    || message.author.globalName
    || message.author.username;
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: authorName, iconURL: message.author.displayAvatarURL() })
    .setTitle(`#${message.channel.name}`)
    .setURL(message.url)
    .setDescription((content || '*No text content*').slice(0, 4096))
    .setTimestamp(message.createdAt);

  if (image) embed.setImage(image.url);

  return {
    content: `⭐ **${count}**`,
    embeds: [embed],
    allowedMentions: { parse: [] },
  };
}

async function fetchMessageOrMissing(channel, messageId) {
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    if (error.code === 10008) return undefined;
    throw error;
  }
}

async function fetchChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.messages) {
    throw new Error(`Configured starboard channel ${channelId} is not a text channel.`);
  }
  return channel;
}

async function removeStarboardPost(guild, sourceMessageId, starredMessage, database) {
  const channel = await fetchChannel(guild, starredMessage.channel_id);
  const post = await fetchMessageOrMissing(channel, starredMessage.message_id);
  if (post) await post.delete();
  database.removeStarredMessage(sourceMessageId);
}

async function updateStarboard(reaction, user, database) {
  if (user.bot || reaction.emoji.name !== starEmoji) return;
  if (reaction.partial) reaction = await reaction.fetch();
  let message = reaction.message;
  if (message.partial) message = await message.fetch();
  if (!message.guild || !message.author || message.author.bot) return;

  const settings = database.getStarboard(message.guildId);
  if (!settings) return;

  const starredMessage = database.getStarredMessage(message.id);
  if (message.channelId === settings.channel_id) return;

  const count = getStarCount(message);
  if (count < settings.threshold) {
    if (starredMessage) {
      await removeStarboardPost(message.guild, message.id, starredMessage, database);
    }
    return;
  }

  const channel = await fetchChannel(message.guild, settings.channel_id);
  const payload = buildStarboardPost(message, count);
  if (starredMessage && starredMessage.channel_id === settings.channel_id) {
    const existingPost = await fetchMessageOrMissing(channel, starredMessage.message_id);
    if (existingPost) {
      await existingPost.edit(payload);
      return;
    }
  } else if (starredMessage) {
    await removeStarboardPost(message.guild, message.id, starredMessage, database);
  }

  const post = await channel.send(payload);
  database.setStarredMessage(message.id, {
    guild_id: message.guildId,
    channel_id: channel.id,
    message_id: post.id,
  });
}

function handleStarboardReaction(reaction, user, database) {
  const messageId = reaction.message.id;
  const previous = operationsByMessage.get(messageId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => updateStarboard(reaction, user, database))
    .finally(() => {
      if (operationsByMessage.get(messageId) === current) operationsByMessage.delete(messageId);
    });
  operationsByMessage.set(messageId, current);
  return current;
}

module.exports = { buildStarboardPost, handleStarboardReaction, starEmoji };
