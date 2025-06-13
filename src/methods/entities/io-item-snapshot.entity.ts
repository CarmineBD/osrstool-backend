import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { VariantSnapshot } from './variant-snapshot.entity';

@Entity('variant_io_items_snapshots')
export class VariantIoItemSnapshot {
  @PrimaryColumn({ name: 'item_id', type: 'int' })
  itemId: number;

  @ManyToOne(() => VariantSnapshot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'snapshot_id' })
  snapshot: VariantSnapshot;

  @PrimaryColumn({ name: 'snapshot_id', type: 'int' })
  snapshotId: number;

  @Column({ type: 'numeric' })
  quantity: number;

  @PrimaryColumn({ type: 'text' })
  type: 'input' | 'output';
}
