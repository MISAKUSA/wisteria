const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getLevelProgress } = require('../leveling-utils');

const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('View a member’s XP and level.')
  .addUserOption((option) => option
    .setName('user')
    .setDescription('The member to check; defaults to you.'));

async function execute(interaction, database) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'Ranks are only available in a server.', flags: MessageFlags.Ephemeral });
  }
  const user = interaction.options.getUser('user') || interaction.user;
  const profile = database.getLevelingProfile(interaction.guildId, user.id);
  const progress = getLevelProgress(profile.total_xp);
  return interaction.reply({
    content: `**${user.tag || user.username}** — Level ${progress.level}\n${progress.xp_into_level}/${progress.xp_for_next_level} XP toward level ${progress.level + 1} · ${profile.total_xp} total XP`,
  });
}

module.exports = { data, execute };
