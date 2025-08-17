export interface XpHourEntry {
  skill: string;
  experience: number;
}

export type XpHour = XpHourEntry[];

export interface RequirementItem {
  id: number;
  quantity: number;
  reason?: string;
}

export interface RequirementLevel {
  skill: string;
  level: number;
  reason?: string;
}

export interface RequirementQuest {
  name: string;
  stage: number;
  reason?: string;
}

export interface RequirementDiary {
  name: string;
  tier: 'easy' | 'medium' | 'hard' | 'elite';
  reason?: string;
}

export interface VariantRequirements {
  items?: RequirementItem[];
  levels?: RequirementLevel[];
  quests?: RequirementQuest[];
  achievement_diaries?: RequirementDiary[];
}

export type VariantRecommendations = VariantRequirements;
