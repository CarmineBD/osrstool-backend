export class SyncItemsDto {
  source?: 'mapping' | 'wiki';
  dryRun?: boolean;
  chunkSize?: number;
  writeSqlFile?: boolean;
}
