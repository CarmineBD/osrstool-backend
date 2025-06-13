import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MethodVariant } from './variant.entity';

@Entity('variant_snapshots')
export class VariantSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MethodVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @Column()
  label: string;

  @Column({ name: 'xp_hour', type: 'jsonb', nullable: true })
  xpHour: any;

  @Column({ name: 'click_intensity', type: 'int', nullable: true })
  clickIntensity: number;

  @Column({ name: 'afkiness', type: 'int', nullable: true })
  afkiness: number;

  @Column({ name: 'risk_level', nullable: true })
  riskLevel: string;

  @Column({ type: 'jsonb', nullable: true })
  requirements: any;

  @Column({ type: 'jsonb', nullable: true })
  recommendations: any;

  @Column({ name: 'actions_per_hour', type: 'int', nullable: true })
  actionsPerHour: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'snapshot_name' })
  snapshotName: string;

  @Column({ name: 'snapshot_description', nullable: true })
  snapshotDescription?: string;

  @Column({ name: 'snapshot_date', type: 'timestamptz' })
  snapshotDate: Date;
}
