export const SKILL_KEY_VALUES = [
  'attack',
  'defence',
  'strength',
  'hitpoints',
  'ranged',
  'prayer',
  'magic',
  'cooking',
  'woodcutting',
  'fletching',
  'fishing',
  'firemaking',
  'crafting',
  'smithing',
  'mining',
  'herblore',
  'agility',
  'thieving',
  'slayer',
  'farming',
  'runecraft',
  'hunter',
  'construction',
  'sailing',
] as const;

export const REQUIREMENT_SKILL_KEY_VALUES = ['combat', ...SKILL_KEY_VALUES] as const;

export type SkillKeyValue = (typeof SKILL_KEY_VALUES)[number];
export type RequirementSkillKeyValue = (typeof REQUIREMENT_SKILL_KEY_VALUES)[number];
