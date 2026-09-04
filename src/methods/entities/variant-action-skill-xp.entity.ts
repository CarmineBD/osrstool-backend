import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Skill } from '../../catalogs/entities/skill.entity';
import { VariantAction } from './variant-action.entity';

@Entity('action_skill_xp')
export class VariantActionSkillXp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VariantAction, (action) => action.skillXp, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: VariantAction;

  @ManyToOne(() => Skill)
  @JoinColumn({ name: 'skill_id' })
  skill: Skill;

  @Column({ name: 'skill_id', type: 'int' })
  skillId: number;

  @Column({ type: 'numeric' })
  experience: number;
}
