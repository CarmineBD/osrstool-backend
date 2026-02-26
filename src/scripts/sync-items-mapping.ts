import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  ItemsMappingSyncOptions,
  ItemsMappingSyncService,
} from '../items/items-mapping-sync.service';

function parseChunkSize(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --chunkSize value: "${rawValue}". It must be a positive integer.`);
  }
  return parsed;
}

function parseArgs(args: string[]): ItemsMappingSyncOptions {
  const options: ItemsMappingSyncOptions = { dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--chunkSize=')) {
      options.chunkSize = parseChunkSize(arg.slice('--chunkSize='.length));
      continue;
    }

    if (arg === '--chunkSize') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value for --chunkSize.');
      }
      options.chunkSize = parseChunkSize(nextValue);
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
    const syncService = app.get(ItemsMappingSyncService);
    const { inserted, updated } = await syncService.syncFromMapping(options);

    if (inserted === 0 && updated === 0) {
      console.log('Sin cambios');
      return;
    }

    console.log(`Items agregados: ${inserted} | Items actualizados: ${updated}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('[sync-items-mapping] Failed:', error);
  process.exitCode = 1;
});
