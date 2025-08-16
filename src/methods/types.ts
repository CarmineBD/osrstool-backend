export type XpHour = Record<string, number>;

export interface VariantRequirements {
  levels?: Record<string, number>;
  quests?: Record<string, number>;
  achievement_diaries?: Record<string, 1 | 2 | 3 | 4>;
}
