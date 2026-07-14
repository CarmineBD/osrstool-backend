import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AdminScriptExecutionStatus = 'running' | 'succeeded' | 'failed';

@Entity({ name: 'admin_script_executions' })
@Index('idx_admin_script_executions_script_started_at', ['scriptName', 'startedAt'])
@Index('idx_admin_script_executions_status_started_at', ['status', 'startedAt'])
export class AdminScriptExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'script_name', type: 'text' })
  scriptName: string;

  @Column({ type: 'text' })
  status: AdminScriptExecutionStatus;

  @Column({ type: 'text', default: 'manual' })
  trigger: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid', nullable: true })
  requestedByUserId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  params: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
