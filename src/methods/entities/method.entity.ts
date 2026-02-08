// src/methods/entities/method.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Check,
} from 'typeorm';
import { MethodVariant } from './variant.entity';

@Entity('money_making_methods')
export class Method {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Check("slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'")
  @Column({ unique: true, length: 160 })
  slug: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => MethodVariant, (v) => v.method, { cascade: true })
  variants: MethodVariant[];
}
