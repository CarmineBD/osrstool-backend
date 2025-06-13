import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { MethodVariant } from './variant.entity';
import { Method } from './method.entity';

@Entity('variant_snapshots')
export class VariantSnapshot {
  @PrimaryGeneratedColumn({ name: 'snapshot_id' })
  snapshotId: number;

  @ManyToOne(() => MethodVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @ManyToOne(() => Method, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'method_id' })
  method?: Method;

  @Column()
  label: string;

  @Column({ name: 'actions_per_hour', type: 'int', nullable: true })
  actionsPerHour?: number;

  @Column({ name: 'xp_hour', type: 'jsonb', nullable: true })
  xpHour?: any;

  @Column({ name: 'click_intensity', type: 'int', nullable: true })
  clickIntensity?: number;

  @Column({ name: 'afkiness', type: 'int', nullable: true })
  afkiness?: number;

  @Column({ name: 'risk_level', nullable: true })
  riskLevel?: string;

  @Column({ type: 'jsonb', nullable: true })
  requirements?: any;

  @Column({ type: 'jsonb', nullable: true })
  recommendations?: any;

  @Column({ name: 'snapshot_title' })
  snapshotName: string;

  @Column({ name: 'snapshot_description', nullable: true })
  snapshotDescription?: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  snapshotDate: Date;
}
