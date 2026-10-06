const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getLevelProgress } = require('../leveling-utils');

const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the top 10 members by XP.');

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'The leaderboard is only available in a server.', flags: MessageFlags.Ephemeral });
  }
  const profiles = database.listLevelingLeaderboard(interaction.guildId, 10);
  if (!profiles.length) {
    return interaction.reply({ content: 'No one has earned XP in this server yet.' });
  }
  const lines = profiles.map((profile, index) => {
    const { level } = getLevelProgress(profile.total_xp);
    return `**${index + 1}.** <@${profile.user_id}> — Level ${level} · ${profile.total_xp} XP`;
  });
  return interaction.reply({
    content: `**Level leaderboard**\n${lines.join('\n')}`,
    allowedMentions: { parse: [] },
  });
}

module.exports = { data, execute };
