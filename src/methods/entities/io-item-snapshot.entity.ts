import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { VariantSnapshot } from './variant-snapshot.entity';

@Entity('variant_io_items_snapshots')
export class VariantIoItemSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => VariantSnapshot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'snapshot_id' })
  snapshot: VariantSnapshot;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ type: 'text' })
  type: 'input' | 'output';
}
