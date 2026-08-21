import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SKILL_KEY_VALUES } from './dto/skill.constants';
import type { UserInfo } from './types';

interface Quests {
  [quest: string]: number;
}

interface Levels {
  [skill: string]: number;
}

interface DiaryTasks {
  complete: boolean;
  tasks: boolean[];
}

interface DiaryDifficulties {
  Easy: DiaryTasks;
  Medium: DiaryTasks;
  Hard: DiaryTasks;
  Elite: DiaryTasks;
}

interface AchievementDiaries {
  [region: string]: DiaryDifficulties;
}

interface RuneScapeApiResponse {
  quests: Quests;
  levels: Levels;
  achievement_diaries: AchievementDiaries;
}

export interface RuneScapeSkillProgress {
  level: number;
  experience: number;
}

@Injectable()
export class RuneScapeApiService {
  async fetchUserInfo(username: string): Promise<UserInfo> {
    const url = `https://sync.runescape.wiki/runelite/player/${username}/STANDARD`;
    try {
      const [res, skillProgress] = await Promise.all([
        fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        }),
        this.fetchAllSkillProgress(username),
      ]);

      if (!res.ok) {
        throw new HttpException(`Request failed with status ${res.status}`, HttpStatus.BAD_GATEWAY);
      }
      const data = (await res.json()) as RuneScapeApiResponse;
      return {
        levels: data.levels,
        experience: Object.fromEntries(
          Object.entries(skillProgress).map(([skill, progress]) => [skill, progress.experience]),
        ),
        quests: data.quests,
        achievement_diaries: data.achievement_diaries,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(`Error fetching levels: ${message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async fetchSkillProgress(
    username: string,
    skill: string,
  ): Promise<RuneScapeSkillProgress | null> {
    const normalizedSkill = skill.trim().toLowerCase();
    const skillProgress = await this.fetchAllSkillProgress(username);
    return skillProgress[normalizedSkill] ?? null;
  }

  private async fetchAllSkillProgress(
    username: string,
  ): Promise<Record<string, RuneScapeSkillProgress>> {
    const url = `https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${encodeURIComponent(
      username,
    )}`;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });

      if (!res.ok) {
        throw new HttpException(`Request failed with status ${res.status}`, HttpStatus.BAD_GATEWAY);
      }

      const text = await res.text();
      const lines = text.split(/\r?\n/);
      return Object.fromEntries(
        SKILL_KEY_VALUES.flatMap((skill, index) => {
          const rawLine = lines[index + 1]?.trim();
          if (!rawLine) return [];

          const [, levelRaw, experienceRaw] = rawLine.split(',');
          const level = Number(levelRaw);
          const experience = Number(experienceRaw);
          if (!Number.isInteger(level) || level < 1) return [];

          return [
            [
              skill,
              {
                level,
                experience: Number.isFinite(experience) && experience >= 0 ? experience : 0,
              },
            ],
          ];
        }),
      );
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(`Error fetching skill progress: ${message}`, HttpStatus.BAD_GATEWAY);
    }
  }
}
