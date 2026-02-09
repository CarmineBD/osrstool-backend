import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Method } from './method.entity';

@Entity('method_likes')
@Unique('UQ_method_likes_user_method', ['userId', 'methodId'])
export class MethodLike {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'method_id', type: 'uuid' })
  methodId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Method, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'method_id' })
  method: Method;
}
