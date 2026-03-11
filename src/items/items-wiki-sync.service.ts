import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { In, Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import {
  isApiOrCacheOnlyItemPage,
  getIndexNameIgnoreReason,
  isObsoleteItemPage,
  parseItemDetailPage,
  parseItemIndexPage,
  type ScrapedWikiItemRecord,
} from './items-wiki-sync.parsers';

const ITEM_IDS_URL = 'https://oldschool.runescape.wiki/w/Item_IDs';
const REQUEST_DELAY_MS = 10;
const DETAIL_FETCH_MAX_RETRIES = 1;
const EXISTING_ITEMS_CHUNK_SIZE = 2000;
const POSTGRES_INTEGER_MAX = 2147483647;
const POSTGRES_INTEGER_MIN = -2147483648;
const DEFAULT_USER_AGENT = 'osrstool-backend items-wiki-sync (contact: set OSRS_WIKI_USER_AGENT)';

type ExistingItemComparable = Pick<
  Item,
  | 'id'
  | 'name'
  | 'iconPath'
  | 'examine'
  | 'value'
  | 'highAlch'
  | 'lowAlch'
  | 'buyLimit'
  | 'questItem'
  | 'equipable'
  | 'noteable'
  | 'stackable'
  | 'weight'
  | 'tradeable'
  | 'members'
>;

type ComparableField =
  | 'name'
  | 'iconPath'
  | 'examine'
  | 'value'
  | 'highAlch'
  | 'lowAlch'
  | 'buyLimit'
  | 'questItem'
  | 'equipable'
  | 'noteable'
  | 'stackable'
  | 'weight'
  | 'tradeable'
  | 'members';

type SqlOperation =
  | { action: 'insert'; item: ScrapedWikiItemRecord }
  | { action: 'update'; item: ScrapedWikiItemRecord; changedFields: ComparableField[] };

export interface ItemsWikiSyncOptions {
  dryRun?: boolean;
  sqlFilePath?: string;
  writeSqlFile?: boolean;
}

export interface ItemsWikiSyncSummary {
  totalRowsFound: number;
  totalSkipped: number;
  totalScraped: number;
  totalInserted: number;
  totalUpdated: number;
  totalUnchanged: number;
  totalFailed: number;
  mode: 'dry' | 'real';
  sqlFilePath?: string;
}

@Injectable()
export class ItemsWikiSyncService {
  private readonly logger = new Logger(ItemsWikiSyncService.name);

  constructor(
    private readonly http: HttpService,
    @InjectRepository(Item) private readonly repo: Repository<Item>,
    private readonly config: ConfigService,
  ) {}

  async syncFromWiki(opts: ItemsWikiSyncOptions = {}): Promise<ItemsWikiSyncSummary> {
    const dryRun = opts.dryRun === true;
    const shouldWriteSqlFile = opts.writeSqlFile !== false;
    const mode: ItemsWikiSyncSummary['mode'] = dryRun ? 'dry' : 'real';
    const summary: ItemsWikiSyncSummary = {
      totalRowsFound: 0,
      totalSkipped: 0,
      totalScraped: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalFailed: 0,
      mode,
    };

    this.logger.log(`[START] Syncing items from OSRS Wiki (mode=${mode}).`);

    const indexHtml = await this.fetchHtml(ITEM_IDS_URL);
    const indexRows = parseItemIndexPage(indexHtml);
    if (indexRows.length === 0) {
      throw new Error('No rows were parsed from OSRS Wiki Item_IDs table.');
    }
    summary.totalRowsFound = indexRows.length;

    const scrapedById = new Map<number, ScrapedWikiItemRecord>();
    const scannedDetailUrls = new Set<string>();
    let didRunDetailRequest = false;

    for (const row of indexRows) {
      if (!/^\d/.test(row.itemIdText)) {
        summary.totalSkipped += 1;
        this.logger.log(`[SKIP] item id is not numeric: ${row.itemIdText} (${row.name})`);
        continue;
      }

      const indexIgnoreReason = getIndexNameIgnoreReason(row.name);
      if (indexIgnoreReason) {
        summary.totalSkipped += 1;
        this.logger.log(
          `[SKIP] ignored by index-name rule (${indexIgnoreReason}): ${this.formatIndexRowLabel(row.name, row.itemIdText)}`,
        );
        continue;
      }

      const canonicalDetailUrl = this.canonicalizeDetailUrl(row.detailUrl);
      if (scannedDetailUrls.has(canonicalDetailUrl)) {
        summary.totalSkipped += 1;
        this.logger.log(
          `[SKIP] duplicate item detail page alias: ${this.formatIndexRowLabel(row.name, row.itemIdText)} -> ${canonicalDetailUrl}`,
        );
        continue;
      }
      scannedDetailUrls.add(canonicalDetailUrl);

      try {
        if (didRunDetailRequest) {
          await sleep(REQUEST_DELAY_MS);
        }
        didRunDetailRequest = true;

        const detailHtml = await this.fetchDetailHtmlWithRetry(canonicalDetailUrl);
        if (isObsoleteItemPage(detailHtml)) {
          summary.totalSkipped += 1;
          this.logger.log(
            `[SKIP] obsolete item page: ${this.formatIndexRowLabel(row.name, row.itemIdText)}`,
          );
          continue;
        }
        if (isApiOrCacheOnlyItemPage(detailHtml)) {
          summary.totalSkipped += 1;
          this.logger.log(
            `[SKIP] api/cache-only item page: ${this.formatIndexRowLabel(row.name, row.itemIdText)}`,
          );
          continue;
        }

        const scrapedItems = parseItemDetailPage(detailHtml);
        if (scrapedItems.length === 0) {
          throw new Error('Detail page did not produce any parsed item.');
        }

        for (const scrapedItem of scrapedItems) {
          summary.totalScraped += 1;
          this.logger.log(`[SCRAPED] ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)}`);

          if (scrapedById.has(scrapedItem.id)) {
            summary.totalSkipped += 1;
            this.logger.log(
              `[SKIP] duplicate parsed item id: ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)}`,
            );
            continue;
          }

          scrapedById.set(scrapedItem.id, scrapedItem);
        }
      } catch (error) {
        summary.totalFailed += 1;
        this.logger.error(`[ERROR] item detail page ${row.detailUrl}: ${toErrorMessage(error)}`);
      }
    }

    this.removeOutOfRangeIds(scrapedById, summary);

    const sqlOperations: SqlOperation[] = [];
    const existingById: Map<number, ExistingItemComparable> =
      scrapedById.size > 0
        ? await this.loadExistingByIds([...scrapedById.keys()])
        : new Map<number, ExistingItemComparable>();

    for (const scrapedItem of scrapedById.values()) {
      const existing = existingById.get(scrapedItem.id);
      if (!existing) {
        sqlOperations.push({ action: 'insert', item: scrapedItem });
        this.logger.log(`[INSERT] ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)}`);
        if (dryRun) {
          summary.totalInserted += 1;
          continue;
        }

        try {
          await this.repo.insert(this.toPersistencePayload(scrapedItem));
          summary.totalInserted += 1;
        } catch (error) {
          summary.totalFailed += 1;
          this.logger.error(
            `[ERROR] ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)}: ${toErrorMessage(error)}`,
          );
        }
        continue;
      }

      const changedFields = this.getChangedFields(existing, scrapedItem);
      if (changedFields.length === 0) {
        summary.totalUnchanged += 1;
        this.logger.log(`[NO_CHANGES] ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)}`);
        continue;
      }

      sqlOperations.push({ action: 'update', item: scrapedItem, changedFields });
      this.logger.log(
        `[UPDATE] ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)} | changed: ${changedFields.join(', ')}`,
      );
      if (dryRun) {
        summary.totalUpdated += 1;
        continue;
      }

      try {
        const updatePayload = this.toPersistencePayload(scrapedItem);
        delete updatePayload.id;
        await this.repo.update({ id: scrapedItem.id }, updatePayload);
        summary.totalUpdated += 1;
      } catch (error) {
        summary.totalFailed += 1;
        this.logger.error(
          `[ERROR] ${this.formatItemLabel(scrapedItem.name, scrapedItem.id)}: ${toErrorMessage(error)}`,
        );
      }
    }

    if (shouldWriteSqlFile) {
      const sqlFilePath = await this.writeSqlArtifact(sqlOperations, mode, opts.sqlFilePath);
      summary.sqlFilePath = sqlFilePath;
      this.logger.log(`[SQL] ${sqlFilePath}`);
    }

    this.logSummary(summary);
    return summary;
  }

  private async loadExistingByIds(ids: number[]): Promise<Map<number, ExistingItemComparable>> {
    const byId = new Map<number, ExistingItemComparable>();
    for (const chunk of this.chunk(ids, EXISTING_ITEMS_CHUNK_SIZE)) {
      const existing = await this.repo.find({
        where: { id: In(chunk) },
        select: {
          id: true,
          name: true,
          iconPath: true,
          examine: true,
          value: true,
          highAlch: true,
          lowAlch: true,
          buyLimit: true,
          questItem: true,
          equipable: true,
          noteable: true,
          stackable: true,
          weight: true,
          tradeable: true,
          members: true,
        },
      });

      for (const item of existing) {
        byId.set(item.id, item);
      }
    }

    return byId;
  }

  private getChangedFields(
    existing: ExistingItemComparable,
    incoming: ScrapedWikiItemRecord,
  ): ComparableField[] {
    const changedFields: ComparableField[] = [];

    const weightChanged =
      this.normalizeNullableNumber(existing.weight) !==
      this.normalizeNullableNumber(incoming.weight);

    const comparisons: Array<{ field: ComparableField; hasChanged: boolean }> = [
      { field: 'name', hasChanged: existing.name !== incoming.name },
      { field: 'iconPath', hasChanged: existing.iconPath !== incoming.iconPath },
      { field: 'examine', hasChanged: existing.examine !== incoming.examine },
      { field: 'value', hasChanged: existing.value !== incoming.value },
      { field: 'highAlch', hasChanged: existing.highAlch !== incoming.highAlch },
      { field: 'lowAlch', hasChanged: existing.lowAlch !== incoming.lowAlch },
      { field: 'buyLimit', hasChanged: existing.buyLimit !== incoming.buyLimit },
      { field: 'questItem', hasChanged: existing.questItem !== incoming.questItem },
      { field: 'equipable', hasChanged: existing.equipable !== incoming.equipable },
      { field: 'noteable', hasChanged: existing.noteable !== incoming.noteable },
      { field: 'stackable', hasChanged: existing.stackable !== incoming.stackable },
      { field: 'tradeable', hasChanged: existing.tradeable !== incoming.tradeable },
      { field: 'members', hasChanged: existing.members !== incoming.members },
      { field: 'weight', hasChanged: weightChanged },
    ];

    for (const comparison of comparisons) {
      if (comparison.hasChanged) {
        changedFields.push(comparison.field);
      }
    }

    return changedFields;
  }

  private normalizeNullableNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toPersistencePayload(scrapedItem: ScrapedWikiItemRecord): Partial<Item> {
    return {
      id: scrapedItem.id,
      name: scrapedItem.name,
      iconPath: scrapedItem.iconPath,
      examine: scrapedItem.examine,
      value: scrapedItem.value,
      highAlch: scrapedItem.highAlch,
      lowAlch: scrapedItem.lowAlch,
      buyLimit: scrapedItem.buyLimit,
      questItem: scrapedItem.questItem,
      equipable: scrapedItem.equipable,
      noteable: scrapedItem.noteable,
      stackable: scrapedItem.stackable,
      weight: scrapedItem.weight,
      tradeable: scrapedItem.tradeable,
      members: scrapedItem.members,
      lastSyncedAt: new Date(),
    };
  }

  private formatItemLabel(name: string, id: number): string {
    return `${name} (${id})`;
  }

  private formatIndexRowLabel(name: string, itemIdText: string): string {
    return `${name} (${itemIdText})`;
  }

  private removeOutOfRangeIds(
    scrapedById: Map<number, ScrapedWikiItemRecord>,
    summary: ItemsWikiSyncSummary,
  ): void {
    for (const [id, item] of scrapedById.entries()) {
      if (this.isPostgresInt(id)) {
        continue;
      }

      scrapedById.delete(id);
      summary.totalSkipped += 1;
      this.logger.log(
        `[SKIP] item id out of integer range for PostgreSQL: ${this.formatItemLabel(item.name, item.id)}`,
      );
    }
  }

  private isPostgresInt(value: number): boolean {
    return (
      Number.isInteger(value) && value >= POSTGRES_INTEGER_MIN && value <= POSTGRES_INTEGER_MAX
    );
  }

  private canonicalizeDetailUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      url.hash = '';
      return url.toString();
    } catch {
      return rawUrl;
    }
  }

  private chunk<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
  }

  private logSummary(summary: ItemsWikiSyncSummary): void {
    this.logger.log(
      `[SUMMARY] rows=${summary.totalRowsFound} skipped=${summary.totalSkipped} scraped=${summary.totalScraped} inserted=${summary.totalInserted} updated=${summary.totalUpdated} unchanged=${summary.totalUnchanged} failed=${summary.totalFailed} mode=${summary.mode}`,
    );
  }

  private async fetchHtml(url: string): Promise<string> {
    const userAgent = this.config.get<string>('OSRS_WIKI_USER_AGENT')?.trim() || DEFAULT_USER_AGENT;
    const response = await firstValueFrom(
      this.http.get<string>(url, {
        responseType: 'text',
        headers: { 'User-Agent': userAgent },
      }),
    );

    if (typeof response.data !== 'string') {
      throw new Error(`Unexpected response body type for ${url}.`);
    }

    return response.data;
  }

  private async fetchDetailHtmlWithRetry(url: string): Promise<string> {
    const totalAttempts = DETAIL_FETCH_MAX_RETRIES + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        return await this.fetchHtml(url);
      } catch (error) {
        if (attempt >= totalAttempts) {
          throw error;
        }

        this.logger.warn(
          `[RETRY] item detail page ${url}: attempt ${attempt}/${totalAttempts} failed (${toErrorMessage(error)}).`,
        );
        await sleep(REQUEST_DELAY_MS);
      }
    }

    throw new Error(`Unexpected retry state while fetching ${url}.`);
  }

  private async writeSqlArtifact(
    operations: SqlOperation[],
    mode: ItemsWikiSyncSummary['mode'],
    overridePath?: string,
  ): Promise<string> {
    const outputPath = overridePath
      ? resolve(process.cwd(), overridePath)
      : resolve(process.cwd(), 'sql', `items-wiki-sync-${mode}-${this.buildFileTimestamp()}.sql`);

    const content = this.buildSqlContent(operations, mode);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf8');
    return outputPath;
  }

  private buildSqlContent(operations: SqlOperation[], mode: ItemsWikiSyncSummary['mode']): string {
    const lines: string[] = [
      '-- Auto-generated by sync-items-wiki',
      `-- Mode: ${mode}`,
      `-- Generated at: ${new Date().toISOString()}`,
      '',
      'BEGIN;',
    ];

    if (operations.length === 0) {
      lines.push('-- No INSERT/UPDATE operations generated.');
    } else {
      for (const operation of operations) {
        if (operation.action === 'insert') {
          lines.push(
            `-- INSERT ${this.formatItemLabel(operation.item.name, operation.item.id)}`,
            this.buildInsertSql(operation.item),
          );
        } else {
          lines.push(
            `-- UPDATE ${this.formatItemLabel(operation.item.name, operation.item.id)} | changed: ${operation.changedFields.join(', ')}`,
            this.buildUpdateSql(operation.item, operation.changedFields),
          );
        }
      }
    }

    lines.push('COMMIT;', '');
    return lines.join('\n');
  }

  private buildInsertSql(item: ScrapedWikiItemRecord): string {
    const columns = [
      'id',
      'name',
      'icon_path',
      'examine',
      'value',
      'high_alch',
      'low_alch',
      'buy_limit',
      'quest_item',
      'equipable',
      'noteable',
      'stackable',
      'weight',
      'tradeable',
      'members',
      'last_synced_at',
    ];
    const values = [
      this.toSqlLiteral(item.id),
      this.toSqlLiteral(item.name),
      this.toSqlLiteral(item.iconPath),
      this.toSqlLiteral(item.examine),
      this.toSqlLiteral(item.value),
      this.toSqlLiteral(item.highAlch),
      this.toSqlLiteral(item.lowAlch),
      this.toSqlLiteral(item.buyLimit),
      this.toSqlLiteral(item.questItem),
      this.toSqlLiteral(item.equipable),
      this.toSqlLiteral(item.noteable),
      this.toSqlLiteral(item.stackable),
      this.toSqlLiteral(item.weight),
      this.toSqlLiteral(item.tradeable),
      this.toSqlLiteral(item.members),
      'now()',
    ];

    return `INSERT INTO items (${columns.join(', ')}) VALUES (${values.join(', ')});`;
  }

  private buildUpdateSql(item: ScrapedWikiItemRecord, changedFields: ComparableField[]): string {
    const setClauses = changedFields.map((field) => {
      const { column, value } = this.resolveFieldSql(field, item);
      return `${column} = ${this.toSqlLiteral(value)}`;
    });
    setClauses.push('last_synced_at = now()');

    return `UPDATE items SET ${setClauses.join(', ')} WHERE id = ${this.toSqlLiteral(item.id)};`;
  }

  private resolveFieldSql(
    field: ComparableField,
    item: ScrapedWikiItemRecord,
  ): { column: string; value: string | number | boolean | null } {
    switch (field) {
      case 'name':
        return { column: 'name', value: item.name };
      case 'iconPath':
        return { column: 'icon_path', value: item.iconPath };
      case 'examine':
        return { column: 'examine', value: item.examine };
      case 'value':
        return { column: 'value', value: item.value };
      case 'highAlch':
        return { column: 'high_alch', value: item.highAlch };
      case 'lowAlch':
        return { column: 'low_alch', value: item.lowAlch };
      case 'buyLimit':
        return { column: 'buy_limit', value: item.buyLimit };
      case 'questItem':
        return { column: 'quest_item', value: item.questItem };
      case 'equipable':
        return { column: 'equipable', value: item.equipable };
      case 'noteable':
        return { column: 'noteable', value: item.noteable };
      case 'stackable':
        return { column: 'stackable', value: item.stackable };
      case 'weight':
        return { column: 'weight', value: item.weight };
      case 'tradeable':
        return { column: 'tradeable', value: item.tradeable };
      case 'members':
        return { column: 'members', value: item.members };
      default:
        return assertNever(field);
    }
  }

  private toSqlLiteral(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return `'${value.replace(/'/g, "''")}'`;
  }

  private buildFileTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled field mapping: ${String(value)}`);
}
