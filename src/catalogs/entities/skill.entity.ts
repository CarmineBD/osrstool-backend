import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('skills')
export class Skill {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  key: string;
}
