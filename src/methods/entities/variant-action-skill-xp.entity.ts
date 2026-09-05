import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Skill } from '../../catalogs/entities/skill.entity';
import { ActionCondition } from '../action-condition.enum';
import { VariantAction } from './variant-action.entity';

@Entity('action_skill_xp')
@Index('uq_action_skill_xp_action_skill_condition', ['action', 'skillId', 'condition'], {
  unique: true,
})
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

  @Column({ type: 'varchar', length: 7, default: ActionCondition.ALWAYS })
  condition: ActionCondition;
}
