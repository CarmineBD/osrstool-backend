import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('items')
export class Item {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'icon_path', type: 'text' })
  iconPath: string;

  @Column({ type: 'text', nullable: true })
  examine: string | null;

  @Column({ type: 'int', nullable: true })
  value: number | null;

  @Column({ name: 'high_alch', type: 'int', nullable: true })
  highAlch: number | null;

  @Column({ name: 'low_alch', type: 'int', nullable: true })
  lowAlch: number | null;

  @Column({ name: 'buy_limit', type: 'int', nullable: true })
  buyLimit: number | null;

  @Column({ name: 'quest_item', type: 'bool', nullable: true })
  questItem: boolean | null;

  @Column({ type: 'bool', nullable: true })
  equipable: boolean | null;

  @Column({ type: 'bool', nullable: true })
  noteable: boolean | null;

  @Column({ type: 'bool', nullable: true })
  stackable: boolean | null;

  @Column({ type: 'numeric', nullable: true })
  weight: number | null;

  @Column({ type: 'bool', default: true })
  tradeable: boolean | null;

  @Column({ type: 'bool', default: false })
  members: boolean | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', default: () => 'now()' })
  lastSyncedAt: Date;
}
