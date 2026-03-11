import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ItemsWikiSyncOptions, ItemsWikiSyncService } from '../items/items-wiki-sync.service';

function parseArgs(args: string[]): ItemsWikiSyncOptions {
  const options: ItemsWikiSyncOptions = { dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--dry-run' || arg === '--dry') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--sql-file=')) {
      options.sqlFilePath = arg.slice('--sql-file='.length).trim();
      if (!options.sqlFilePath) {
        throw new Error('Invalid --sql-file value.');
      }
      continue;
    }

    if (arg === '--sql-file') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value for --sql-file.');
      }
      options.sqlFilePath = nextValue.trim();
      if (!options.sqlFilePath) {
        throw new Error('Invalid --sql-file value.');
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: "${arg}".`);
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const syncService = app.get(ItemsWikiSyncService);
    const summary = await syncService.syncFromWiki(options);
    console.log(
      `[sync-items-wiki] rows=${summary.totalRowsFound} skipped=${summary.totalSkipped} scraped=${summary.totalScraped} inserted=${summary.totalInserted} updated=${summary.totalUpdated} unchanged=${summary.totalUnchanged} failed=${summary.totalFailed} mode=${summary.mode} sqlFile=${summary.sqlFilePath ?? 'none'}`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('[sync-items-wiki] Failed:', error);
  process.exitCode = 1;
});
