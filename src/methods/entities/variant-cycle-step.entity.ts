import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VariantAction } from './variant-action.entity';
import { VariantCycle } from './variant-cycle.entity';

@Entity('cycle_steps')
export class VariantCycleStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VariantCycle, (cycle) => cycle.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_id' })
  cycle: VariantCycle;

  @Column({ name: 'step_order_position', type: 'int' })
  stepOrderPosition: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'duration_ticks', type: 'int', nullable: true })
  durationTicks: number | null;

  @Column({ name: 'clicks_made', type: 'int', default: 0 })
  clicksMade: number;

  @Column({ name: 'is_afk', type: 'boolean', default: false })
  isAfk: boolean;

  @ManyToOne(() => VariantAction, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id_made' })
  actionMade: VariantAction | null;

  @Column({ name: 'actions_made', type: 'int', nullable: true })
  actionsMade: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
