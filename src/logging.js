const { EmbedBuilder, MessageFlags } = require('discord.js');

const MAX_DESCRIPTION_LENGTH = 4000;

const loggingTypes = [
  { name: 'Confessions and anonymous replies', value: 'confessions' },
  { name: 'Photos', value: 'photos' },
  { name: 'Videos', value: 'videos' },
  { name: 'Voice messages', value: 'voice_messages' },
  { name: 'Message edits and deletions', value: 'messages' },
  { name: 'Member joins, leaves, and profile changes', value: 'members' },
  { name: 'Channels', value: 'channels' },
  { name: 'Threads', value: 'threads' },
  { name: 'Roles', value: 'roles' },
  { name: 'Bans and unbans', value: 'bans' },
  { name: 'Voice channel activity', value: 'voice_activity' },
  { name: 'Bot commands and interactions', value: 'interactions' },
];

function getLoggingType(title) {
  if (/confession|anonymous poll/i.test(title)) return 'confessions';
  if (/^Photo shared$/i.test(title)) return 'photos';
  if (/^Video shared$/i.test(title)) return 'videos';
  if (/^Voice message shared$/i.test(title)) return 'voice_messages';
  if (/^Media shared$/i.test(title)) return undefined;
  if (/^Message|^Messages bulk/i.test(title)) return 'messages';
  if (/^Member (joined|left|updated)$/i.test(title)) return 'members';
  if (/^Channel /i.test(title)) return 'channels';
  if (/^Thread /i.test(title)) return 'threads';
  if (/^Role /i.test(title)) return 'roles';
  if (/^Member (banned|unbanned)$/i.test(title)) return 'bans';
  if (/^(Joined|Left|Moved) voice channel$|^Voice state updated$/i.test(title)) return 'voice_activity';
  if (/^Bot interaction:/i.test(title)) return 'interactions';
  return undefined;
}

async function logEvent(guild, database, title, description, color = 0x5865f2, type = getLoggingType(title)) {
  if (database.isLoggingEnabled && !database.isLoggingEnabled(guild.id)) return;
  if (type && database.isLoggingTypeEnabled && !database.isLoggingTypeEnabled(guild.id, type)) return;
  const channelId = database.getLoggingChannel(guild.id);
  if (!channelId) return;

  try {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.messages) {
      throw new Error(`Configured logging channel ${channelId} is not a text channel.`);
    }
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title.slice(0, 256))
          .setDescription((description || 'No additional details.').slice(0, MAX_DESCRIPTION_LENGTH))
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error(`Could not log "${title}" in server ${guild.id}:`, error);
  }
}

function getMediaLog(message) {
  const attachments = [...message.attachments.values()];
  if (!attachments.length) return undefined;

  const voiceMessage = message.flags?.has(MessageFlags.IsVoiceMessage) || false;
  const media = attachments.map((attachment) => {
    const contentType = attachment.contentType || '';
    const filename = attachment.name || attachment.url.split('?')[0];
    const extension = filename.toLowerCase().split('.').pop();
    if (contentType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'avif'].includes(extension)) {
      return { type: 'Photo', attachment };
    }
    if (contentType.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'mpeg', 'mpg'].includes(extension)) {
      return { type: 'Video', attachment };
    }
    if (voiceMessage) return { type: 'Voice message', attachment };
    return undefined;
  }).filter(Boolean);

  if (!media.length) return undefined;

  const types = [...new Set(media.map((item) => item.type))];
  const title = types.length === 1 ? `${types[0]} shared` : 'Media shared';
  const makeDescription = (items) => {
    const attachmentDetails = items.slice(0, 5).map(({ type, attachment }) => (
      `${type}: ${attachment.url}`
    )).join('\n');
    const moreAttachments = items.length > 5 ? `\n…and ${items.length - 5} more attachment(s).` : '';
    return `Author: ${message.author.tag} (<@${message.author.id}>)\nChannel: <#${message.channelId}>${message.content ? `\nCaption: ${message.content}` : ''}\n${attachmentDetails}${moreAttachments}`;
  };
  return {
    title,
    description: makeDescription(media),
    events: types.map((type) => ({
      title: `${type} shared`,
      description: makeDescription(media.filter((item) => item.type === type)),
      type: {
        Photo: 'photos',
        Video: 'videos',
        'Voice message': 'voice_messages',
      }[type],
    })),
  };
}

module.exports = { getMediaLog, getLoggingType, loggingTypes, logEvent };
