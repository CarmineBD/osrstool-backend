import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { GameIconType } from '../icon-source.enum';

@Entity('icons')
export class GameIcon {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  type: GameIconType;

  @Column({ name: 'icon_path', type: 'text' })
  iconPath: string;

  @Column({ name: 'last_synced_at', type: 'timestamptz', default: () => 'now()' })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
