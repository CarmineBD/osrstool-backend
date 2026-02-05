import { Column, Entity, PrimaryColumn } from 'typeorm';

export enum ItemPriceRuleType {
  FIXED = 'FIXED',
  RECIPE = 'RECIPE',
  BEST_RECIPE = 'BEST_RECIPE',
}

@Entity('item_price_rules')
export class ItemPriceRule {
  @PrimaryColumn({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({
    name: 'rule_type',
    type: 'enum',
    enum: ItemPriceRuleType,
    enumName: 'item_price_rule_type',
  })
  ruleType: ItemPriceRuleType;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  params: unknown;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'is_enabled', type: 'bool', default: true })
  isEnabled: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
