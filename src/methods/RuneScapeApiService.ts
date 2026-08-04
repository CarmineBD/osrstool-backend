import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SKILL_KEY_VALUES } from './dto/skill.constants';

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
  async fetchUserInfo(username: string): Promise<any> {
    const url = `https://sync.runescape.wiki/runelite/player/${username}/STANDARD`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });

      if (!res.ok) {
        throw new HttpException(`Request failed with status ${res.status}`, HttpStatus.BAD_GATEWAY);
      }
      const data = (await res.json()) as RuneScapeApiResponse;
      return {
        levels: data.levels,
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
    const skillIndex = SKILL_KEY_VALUES.findIndex((entry) => entry === normalizedSkill);
    if (skillIndex < 0) {
      return null;
    }

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
      const rawLine = lines[skillIndex + 1]?.trim();
      if (!rawLine) {
        return null;
      }

      const [, levelRaw, experienceRaw] = rawLine.split(',');
      const level = Number(levelRaw);
      const experience = Number(experienceRaw);

      if (!Number.isInteger(level) || level < 1) {
        return null;
      }

      return {
        level,
        experience: Number.isFinite(experience) && experience >= 0 ? experience : 0,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(`Error fetching skill progress: ${message}`, HttpStatus.BAD_GATEWAY);
    }
  }
}
