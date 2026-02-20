import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('item_volume_buckets')
export class ItemVolumeBucket {
  @PrimaryColumn({ name: 'item_id', type: 'int' })
  itemId: number;

  // bucket_ts stores the hour-aligned timestamp associated with the /1h snapshot.
  @PrimaryColumn({ name: 'bucket_ts', type: 'timestamptz' })
  bucketTs: Date;

  @Column({ name: 'high_volume', type: 'int', default: 0 })
  highVolume: number;

  @Column({ name: 'low_volume', type: 'int', default: 0 })
  lowVolume: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
