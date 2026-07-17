export const ACHIEVEMENT_DIARY_TIER_VALUES = ['easy', 'medium', 'hard', 'elite'] as const;

export type AchievementDiaryTierValue = (typeof ACHIEVEMENT_DIARY_TIER_VALUES)[number];
