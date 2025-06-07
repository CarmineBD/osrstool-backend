import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { MethodVariant } from './variant.entity';

@Entity('variant_history')
export class VariantHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MethodVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ name: 'low_profit', type: 'numeric' })
  lowProfit: number;

  @Column({ name: 'high_profit', type: 'numeric' })
  highProfit: number;
}
