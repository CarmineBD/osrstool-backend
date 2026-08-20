// src/methods/entities/method.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { MethodVariant } from './variant.entity';
import { User } from '../../auth/entities/user.entity';

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

  @Column({ name: 'icon_id', type: 'int', nullable: true })
  iconId?: number | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id' })
  createdByUser?: User | null;

  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial?: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt?: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt?: Date;

  @OneToMany(() => MethodVariant, (v) => v.method, { cascade: true })
  variants: MethodVariant[];
}
