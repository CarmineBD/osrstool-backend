import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MethodVariant } from './variant.entity';
import { VariantActionInput } from './variant-action-input.entity';
import { VariantActionOutput } from './variant-action-output.entity';
import { VariantActionSkillXp } from './variant-action-skill-xp.entity';

@Entity('actions')
export class VariantAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => MethodVariant, (variant) => variant.dynamicAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'roll_interval_ticks', type: 'int' })
  rollIntervalTicks: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => VariantActionInput, (input) => input.action, { cascade: true })
  inputs: VariantActionInput[];

  @OneToMany(() => VariantActionOutput, (output) => output.action, { cascade: true })
  outputs: VariantActionOutput[];

  @OneToMany(() => VariantActionSkillXp, (skillXp) => skillXp.action, { cascade: true })
  skillXp: VariantActionSkillXp[];
}
