import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Redis from 'ioredis';

interface PriceEntry {
  high?: number;
  highTime?: number;
  low: number;
  lowTime?: number;
}

const SOURCE_KEY = 'itemsPrices';
const TARGET_KEY = 'items:prices';
const BATCH_SIZE = 500;

function loadRedisUrlFromEnvFile(): string | undefined {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return undefined;

  const content = readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sepIndex = trimmed.indexOf('=');
    if (sepIndex <= 0) continue;
    const key = trimmed.slice(0, sepIndex).trim();
    if (key !== 'REDIS_URL') continue;
    const value = trimmed
      .slice(sepIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    return value || undefined;
  }

  return undefined;
}

function tryParsePrices(raw: unknown): Record<string, PriceEntry> {
  if (raw == null) return {};

  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }

  // JSON.GET key "$" returns an array with the root value.
  if (Array.isArray(parsed)) {
    parsed = parsed[0] ?? {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, PriceEntry>;
}

async function main() {
  const redisUrl = process.env.REDIS_URL ?? loadRedisUrlFromEnvFile();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required (env var or .env file).');
  }

  const redis = new Redis(redisUrl);
  try {
    const raw = await redis.call('JSON.GET', SOURCE_KEY);
    let prices = tryParsePrices(raw);
    if (Object.keys(prices).length === 0) {
      const rawWithPath = await redis.call('JSON.GET', SOURCE_KEY, '$');
      prices = tryParsePrices(rawWithPath);
    }

    const entries = Object.entries(prices);
    if (entries.length === 0) {
      console.log(`[migrate-items-prices] No data found in key "${SOURCE_KEY}".`);
      return;
    }

    console.log(
      `[migrate-items-prices] Migrating ${entries.length} items from "${SOURCE_KEY}" to hash "${TARGET_KEY}"...`,
    );

    let written = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const pipeline = redis.pipeline();

      for (const [itemId, price] of chunk) {
        pipeline.hset(TARGET_KEY, itemId, JSON.stringify(price));
      }

      await pipeline.exec();
      written += chunk.length;
    }

    const targetCount = await redis.hlen(TARGET_KEY);
    console.log(
      `[migrate-items-prices] Done. Wrote ${written} fields. "${TARGET_KEY}" now has ${targetCount} fields.`,
    );
    console.log(
      `[migrate-items-prices] Source key "${SOURCE_KEY}" was kept untouched for backward compatibility.`,
    );
  } finally {
    await redis.quit();
  }
}

void main().catch((error: unknown) => {
  console.error('[migrate-items-prices] Migration failed:', error);
  process.exitCode = 1;
});
