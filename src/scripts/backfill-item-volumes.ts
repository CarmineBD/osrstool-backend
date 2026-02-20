import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ItemVolumesService } from '../item-volumes/item-volumes.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const itemVolumesService = app.get(ItemVolumesService);
    const rawTs = process.argv[2];
    let referenceTs: number | undefined;

    if (rawTs) {
      const parsedTs = Number.parseInt(rawTs, 10);
      if (!Number.isInteger(parsedTs) || parsedTs <= 0) {
        throw new Error(`Invalid timestamp argument: "${rawTs}".`);
      }
      referenceTs = parsedTs;
    }

    await itemVolumesService.forceBackfillLast24Hours(referenceTs);
    console.log(`[backfill-item-volumes] Done for referenceTs=${referenceTs ?? 'currentHour'}.`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('[backfill-item-volumes] Failed:', error);
  process.exitCode = 1;
});
