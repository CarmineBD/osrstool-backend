import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Skill } from '../../catalogs/entities/skill.entity';
import { ModifierType } from '../modifier.constants';
import { MethodVariant } from './variant.entity';
import { ModifierEffect } from './modifier-effect.entity';

@Entity('modifiers')
@Index('idx_modifiers_variant_id', ['variant'])
@Index('idx_modifiers_skill_id', ['skillId'])
export class Modifier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MethodVariant, (variant) => variant.modifiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: MethodVariant;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  type: ModifierType;

  @ManyToOne(() => Skill, { nullable: true })
  @JoinColumn({ name: 'skill_id' })
  skill?: Skill | null;

  @Column({ name: 'skill_id', type: 'int', nullable: true })
  skillId?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ModifierEffect, (effect) => effect.modifier, { cascade: true })
  effects: ModifierEffect[];
}
