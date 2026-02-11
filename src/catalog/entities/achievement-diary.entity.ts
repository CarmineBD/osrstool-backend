import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('achievement_diaries')
export class AchievementDiary {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'text' })
  area: string;

  @Column({ type: 'text' })
  tier: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;
}
