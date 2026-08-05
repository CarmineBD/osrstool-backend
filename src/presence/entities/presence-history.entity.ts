import { Column, Entity, PrimaryColumn } from 'typeorm';

export type PresenceHistoryBucketKind = 'hour' | 'day';

@Entity('presence_history')
export class PresenceHistory {
  @PrimaryColumn({ name: 'bucket_kind', type: 'text' })
  bucketKind: PresenceHistoryBucketKind;

  @PrimaryColumn({ name: 'bucket_start', type: 'timestamptz' })
  bucketStart: Date;

  @Column({ name: 'peak_online', type: 'int' })
  peakOnline: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
