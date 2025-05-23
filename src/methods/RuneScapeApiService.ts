import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

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
}
