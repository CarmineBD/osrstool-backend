// src/methods/entities/io-item.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { MethodVariant } from './variant.entity';

@Entity('variant_io_items')
export class VariantIoItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MethodVariant, (v) => v.ioItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' }) // aquí ya estabas mapeando variant_id
  variant: MethodVariant;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({ type: 'text' })
  type: 'input' | 'output';

  @Column({ type: 'numeric' })
  quantity: number;
}
