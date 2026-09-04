// src/methods/entities/variant.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Unique,
  Check,
} from 'typeorm';
import { Method } from './method.entity';
import { VariantIoItem } from './io-item.entity';
import { XpHour, VariantRequirements, VariantRecommendations } from '../types';
import { ActionType } from '../action-type.enum';
import { IconSource } from '../../icons/icon-source.enum';
import { CalculationMode } from '../calculation-mode.enum';
import { VariantAction } from './variant-action.entity';
import { VariantCycle } from './variant-cycle.entity';

@Entity('method_variants')
@Unique('UQ_variant_method_slug', ['method', 'slug'])
export class MethodVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Method, (m) => m.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'method_id' })
  method: Method;

  @Column()
  label: string;

  @Check("slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'")
  @Column({ length: 160 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'icon_id', type: 'bigint', nullable: true })
  iconId?: number | null;

  @Column({ name: 'icon_source', type: 'text', default: IconSource.ITEM })
  iconSource: IconSource;

  @Column({ name: 'calculation_mode', type: 'varchar', length: 16, default: CalculationMode.FIXED })
  calculationMode: CalculationMode;

  // AquÃƒÂ­ forzamos que xpHour se guarde/lea de la columna xp_hour
  @Column({
    name: 'xp_hour',
    type: 'jsonb',
    nullable: true,
  })
  xpHour: XpHour | null;

  // Nuevos campos con tipos y nombres de columna actualizados:
  @Column({ name: 'click_intensity', type: 'int', nullable: true })
  clickIntensity: number | null;

  @Column({ name: 'afkiness', type: 'int', nullable: true })
  afkiness: number | null;

  @Column({ name: 'risk_level', nullable: true })
  riskLevel: string;

  @Column({ type: 'jsonb', nullable: true })
  requirements: VariantRequirements | null;

  @Column({ type: 'jsonb', nullable: true })
  recommendations: VariantRecommendations | null;

  @Column({ type: 'boolean', default: false })
  wilderness: boolean;

  @Column({ type: 'boolean', default: false })
  members?: boolean;

  @Column({
    name: 'actions_per_hour',
    type: 'int',
    nullable: true,
  })
  actionsPerHour: number | null;

  @Column({
    name: 'action_type',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  actionType: ActionType | null;

  @Column({ name: 'likes_count', type: 'int', default: 0 })
  likesCount?: number;

  @Column({
    name: 'liked_user_ids',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  likedUserIds?: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => VariantIoItem, (i) => i.variant, { cascade: true })
  @JoinColumn({ name: 'variant_id' })
  ioItems: VariantIoItem[];

  @OneToOne(() => VariantAction, (action) => action.variant)
  dynamicAction?: VariantAction | null;

  @OneToOne(() => VariantCycle, (cycle) => cycle.variant)
  dynamicCycle?: VariantCycle | null;
}
