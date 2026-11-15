export const MODIFIER_TYPES = ['skill_level', 'location', 'equipment'] as const;
export type ModifierType = (typeof MODIFIER_TYPES)[number];

export const MODIFIER_TARGET_TYPES = [
  'actions',
  'actions_inputs',
  'actions_outputs',
  'actions_skill_xp',
  'cycle_steps',
] as const;
export type ModifierTargetType = (typeof MODIFIER_TARGET_TYPES)[number];

export const MODIFIER_OPERATIONS = ['set', 'add', 'multiply'] as const;
export type ModifierOperation = (typeof MODIFIER_OPERATIONS)[number];

export const MODIFIER_VALUE_TYPES = ['constant', 'curve'] as const;
export type ModifierValueType = (typeof MODIFIER_VALUE_TYPES)[number];

export const MODIFIER_TARGET_PROPERTIES: Record<ModifierTargetType, readonly string[]> = {
  actions: ['rollIntervalTicks', 'baseSuccessChance'],
  actions_inputs: ['quantity'],
  actions_outputs: ['quantity'],
  actions_skill_xp: ['experience'],
  cycle_steps: ['durationTicks', 'clicksMade', 'isAfk', 'actionsMade'],
};
