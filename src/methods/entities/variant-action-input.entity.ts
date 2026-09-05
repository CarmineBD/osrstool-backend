import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ActionCondition } from '../action-condition.enum';
import { VariantAction } from './variant-action.entity';

@Entity('actions_inputs')
@Index('uq_actions_inputs_action_item_condition', ['action', 'itemId', 'condition'], {
  unique: true,
})
export class VariantActionInput {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VariantAction, (action) => action.inputs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: VariantAction;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ type: 'varchar', length: 7, default: ActionCondition.ALWAYS })
  condition: ActionCondition;
}
