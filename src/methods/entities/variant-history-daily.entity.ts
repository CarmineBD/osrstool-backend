import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MethodVariant } from './variant.entity';

@Entity('variant_history_daily')
export class VariantHistoryDaily {
  @PrimaryColumn({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => MethodVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @PrimaryColumn({ name: 'bucket_date', type: 'date' })
  bucketDate: string;

  @Column({ name: 'low_profit_sum', type: 'numeric' })
  lowProfitSum: number;

  @Column({ name: 'high_profit_sum', type: 'numeric' })
  highProfitSum: number;

  @Column({ name: 'low_profit_min', type: 'numeric' })
  lowProfitMin: number;

  @Column({ name: 'low_profit_max', type: 'numeric' })
  lowProfitMax: number;

  @Column({ name: 'high_profit_min', type: 'numeric' })
  highProfitMin: number;

  @Column({ name: 'high_profit_max', type: 'numeric' })
  highProfitMax: number;

  @Column({ name: 'open_low_profit', type: 'numeric' })
  openLowProfit: number;

  @Column({ name: 'open_high_profit', type: 'numeric' })
  openHighProfit: number;

  @Column({ name: 'open_timestamp', type: 'timestamptz' })
  openTimestamp: Date;

  @Column({ name: 'close_low_profit', type: 'numeric' })
  closeLowProfit: number;

  @Column({ name: 'close_high_profit', type: 'numeric' })
  closeHighProfit: number;

  @Column({ name: 'close_timestamp', type: 'timestamptz' })
  closeTimestamp: Date;

  @Column({ type: 'int' })
  samples: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
