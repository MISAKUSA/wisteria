function logAutomationError(action, channelId, error) {
  if (error.code === 10008) return;
  console.error(`Could not ${action} in channel ${channelId}:`, error);
}

function handleMessageAutomations(message, database) {
  if (!message.guild || message.author.bot) return;

  const channelId = message.channelId;
  const autoDelete = database.getAutoDelete(channelId);
  if (autoDelete) {
    setTimeout(() => {
      message.delete().catch((error) => logAutomationError('delete message', channelId, error));
    }, autoDelete.delay_seconds * 1000);
  }

  if (!database.getAutoThread(channelId) || message.hasThread) return;
  const image = message.attachments.find((attachment) => attachment.contentType?.startsWith('image/'));
  if (!image) return;

  const fileTitle = (image.name || '').replace(/\.[^.]+$/, '');
  const title = (message.content.trim() || fileTitle || `Photo from ${message.author.username}`)
    .slice(0, 100);
  message.startThread({ name: title }).catch((error) => {
    logAutomationError('start image thread', channelId, error);
  });
}

module.exports = { handleMessageAutomations };
