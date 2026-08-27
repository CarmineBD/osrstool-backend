import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { FeedbackStatus, FeedbackType } from '../feedback.enums';

@Entity({ schema: 'public', name: 'feedback' })
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: User;

  @Column({ type: 'enum', enum: FeedbackType, enumName: 'feedback_type' })
  type: FeedbackType;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: FeedbackStatus,
    enumName: 'feedback_status',
    default: FeedbackStatus.NEW,
  })
  status: FeedbackStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
