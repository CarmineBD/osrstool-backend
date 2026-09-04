import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { VariantAction } from './variant-action.entity';

@Entity('actions_outputs')
export class VariantActionOutput {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VariantAction, (action) => action.outputs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: VariantAction;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({ type: 'numeric' })
  quantity: number;
}
