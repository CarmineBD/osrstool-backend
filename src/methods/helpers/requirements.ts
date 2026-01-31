import {
  RequirementDiary,
  RequirementLevel,
  RequirementQuest,
  UserInfo,
  VariantRequirements,
} from '../types';
import { MethodDto } from '../dto/method.dto';

export function filterMethodsByUserStats(methods: MethodDto[], userInfo: UserInfo): MethodDto[] {
  // Build a lower-cased quest map for quick lookup.
  const userQuests = Object.entries(userInfo.quests).reduce(
    (acc, [name, status]) => {
      acc[name.toLowerCase()] = status;
      return acc;
    },
    {} as Record<string, number>,
  );

  return methods.reduce<MethodDto[]>((acc, method) => {
    const validVariants = method.variants.filter((variant) => {
      const req: VariantRequirements = variant.requirements ?? {};
      const { levels: reqLevels, quests: reqQuests, achievement_diaries: reqDiaries } = req;

      if (reqLevels) {
        for (const lvl of reqLevels) {
          if (lvl.skill === 'Combat') {
            for (const stat of ['Strength', 'Defence', 'Attack']) {
              if ((userInfo.levels[stat] ?? 0) < lvl.level) return false;
            }
          } else if ((userInfo.levels[lvl.skill] ?? 0) < lvl.level) {
            return false;
          }
        }
      }

      if (reqQuests) {
        for (const q of reqQuests) {
          if ((userQuests[q.name.toLowerCase()] ?? 0) < q.stage) return false;
        }
      }

      if (reqDiaries) {
        const tierMap = {
          easy: 'Easy',
          medium: 'Medium',
          hard: 'Hard',
          elite: 'Elite',
        } as const;
        for (const d of reqDiaries) {
          const tier = tierMap[d.tier];
          const info = userInfo.achievement_diaries[d.name];
          if (!info?.[tier]?.complete) return false;
        }
      }

      return true;
    });

    if (validVariants.length) {
      acc.push({ ...method, variants: validVariants });
    }
    return acc;
  }, []);
}

export function computeMissingRequirements(
  requirements: VariantRequirements | null,
  userInfo: UserInfo,
): VariantRequirements | null {
  if (!requirements) return null;
  const missing: VariantRequirements = {};

  const { levels, quests, achievement_diaries } = requirements;

  if (levels) {
    const levelMissing: RequirementLevel[] = [];
    for (const lvl of levels) {
      if (lvl.skill === 'Combat') {
        for (const stat of ['Strength', 'Defence', 'Attack']) {
          if ((userInfo.levels[stat] ?? 0) < lvl.level) {
            levelMissing.push({ skill: stat, level: lvl.level });
          }
        }
      } else if ((userInfo.levels[lvl.skill] ?? 0) < lvl.level) {
        levelMissing.push(lvl);
      }
    }
    if (levelMissing.length) missing.levels = levelMissing;
  }

  if (quests) {
    const userQuests = Object.entries(userInfo.quests).reduce(
      (acc, [name, status]) => {
        acc[name.toLowerCase()] = status;
        return acc;
      },
      {} as Record<string, number>,
    );
    const questMissing: RequirementQuest[] = [];
    for (const q of quests) {
      if ((userQuests[q.name.toLowerCase()] ?? 0) < q.stage) {
        questMissing.push(q);
      }
    }
    if (questMissing.length) missing.quests = questMissing;
  }

  if (achievement_diaries) {
    const diaryMissing: RequirementDiary[] = [];
    const tierMap = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      elite: 'Elite',
    } as const;
    for (const d of achievement_diaries) {
      const tier = tierMap[d.tier];
      const info = userInfo.achievement_diaries[d.name];
      if (!info?.[tier]?.complete) {
        diaryMissing.push(d);
      }
    }
    if (diaryMissing.length) missing.achievement_diaries = diaryMissing;
  }

  return Object.keys(missing).length ? missing : null;
}
