function levelForXp(totalXp) {
  let level = 0;
  let remainingXp = totalXp;
  while (remainingXp >= (level + 1) * 100) {
    remainingXp -= (level + 1) * 100;
    level += 1;
  }
  return level;
}

function getLevelProgress(totalXp) {
  const level = levelForXp(totalXp);
  const xpAtCurrentLevel = 50 * level * (level + 1);
  return {
    level,
    xp_into_level: totalXp - xpAtCurrentLevel,
    xp_for_next_level: (level + 1) * 100,
  };
}

module.exports = { getLevelProgress, levelForXp };
