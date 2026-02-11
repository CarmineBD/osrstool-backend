import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('quests')
export class Quest {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;
}
