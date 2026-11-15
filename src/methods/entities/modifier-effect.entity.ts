import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModifierOperation, ModifierTargetType, ModifierValueType } from '../modifier.constants';
import { Modifier } from './modifier.entity';

@Entity('modifier_effects')
@Index('idx_modifier_effects_modifier_id', ['modifier'])
@Index('idx_modifier_effects_target', ['targetType', 'targetId'])
export class ModifierEffect {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Modifier, (modifier) => modifier.effects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modifier_id' })
  modifier: Modifier;

  @Column({ name: 'target_type', type: 'varchar', length: 32 })
  targetType: ModifierTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ name: 'target_property', type: 'varchar', length: 64 })
  targetProperty: string;

  @Column({ type: 'varchar', length: 16 })
  operation: ModifierOperation;

  @Column({ name: 'value_type', type: 'varchar', length: 16 })
  valueType: ModifierValueType;

  @Column({ type: 'jsonb' })
  value: boolean | number | Record<string, unknown>;

  @Column({ type: 'int', default: 100 })
  priority: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
