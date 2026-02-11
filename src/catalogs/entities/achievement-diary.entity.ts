import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('achievement_diaries')
export class AchievementDiary {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'text' })
  region: string;

  @Column({ type: 'text' })
  tier: string;
}
