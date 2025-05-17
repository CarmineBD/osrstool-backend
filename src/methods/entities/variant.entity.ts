// src/methods/entities/variant.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Method } from './method.entity';
import { VariantIoItem } from './io-item.entity';

@Entity('method_variants')
export class MethodVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Method, (m) => m.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'method_id' })
  method: Method;

  @Column()
  label: string;

  // Aquí forzamos que xpHour se guarde/lea de la columna xp_hour
  @Column({
    name: 'xp_hour',
    type: 'jsonb',
    nullable: true,
  })
  xpHour?: any; // { hitpoints:number, combat:number }

  @Column({
    name: 'actions_per_hour',
    type: 'int',
    nullable: true,
  })
  actionsPerHour?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => VariantIoItem, (i) => i.variant, { cascade: true })
  @JoinColumn({ name: 'variant_id' })
  ioItems: VariantIoItem[];
}
