import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MethodVariant } from './variant.entity';
import { VariantCycleStep } from './variant-cycle-step.entity';

@Entity('cycles')
export class VariantCycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => MethodVariant, (variant) => variant.dynamicCycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => VariantCycleStep, (step) => step.cycle, { cascade: true })
  steps: VariantCycleStep[];
}
