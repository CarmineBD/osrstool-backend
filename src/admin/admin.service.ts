import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Item } from '../items/entities/item.entity';
import { ItemsMappingSyncService } from '../items/items-mapping-sync.service';
import { ItemsWikiSyncService } from '../items/items-wiki-sync.service';
import { Quest } from '../catalogs/entities/quest.entity';
import { Method } from '../methods/entities/method.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { MethodProfitRefresherService } from '../method-profit-refresher/method-profit-refresher.service';
import { SyncItemsDto } from './dto/sync-items.dto';
import { AdminScriptExecution } from './entities/admin-script-execution.entity';

type ScriptResult = Record<string, unknown>;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminScriptExecution)
    private readonly executionRepo: Repository<AdminScriptExecution>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Quest)
    private readonly questRepo: Repository<Quest>,
    @InjectRepository(Method)
    private readonly methodRepo: Repository<Method>,
    @InjectRepository(MethodVariant)
    private readonly variantRepo: Repository<MethodVariant>,
    private readonly itemsMappingSyncService: ItemsMappingSyncService,
    private readonly itemsWikiSyncService: ItemsWikiSyncService,
    private readonly methodProfitRefresherService: MethodProfitRefresherService,
  ) {}

  async getOverview() {
    const [
      usersRegistered,
      items,
      quests,
      methodsTotal,
      methodsEnabled,
      methodsDisabled,
      variants,
      enabledMethodVariantsBySkill,
      latestExecutions,
    ] = await Promise.all([
      this.userRepo.count(),
      this.itemRepo.count(),
      this.questRepo.count(),
      this.methodRepo.count(),
      this.methodRepo.count({ where: { enabled: true } }),
      this.methodRepo.count({ where: { enabled: false } }),
      this.getMethodVariantCounts(),
      this.getEnabledMethodVariantsBySkill(),
      this.getLatestExecutionsByScript(),
    ]);

    return {
      data: {
        counts: {
          usersRegistered,
          items,
          quests,
          methods: {
            total: methodsTotal,
            enabled: methodsEnabled,
            disabled: methodsDisabled,
          },
          variants,
          enabledMethodVariantsBySkill,
        },
        latestExecutions,
      },
    };
  }

  async listExecutions(limitRaw?: string, scriptName?: string) {
    const limit = this.parseLimit(limitRaw);
    const where = scriptName ? { scriptName } : {};
    const executions = await this.executionRepo.find({
      where,
      order: { startedAt: 'DESC' },
      take: limit,
    });

    return {
      data: executions,
      meta: { limit, scriptName: scriptName ?? null },
    };
  }

  async runItemsSync(dto: SyncItemsDto | undefined, requestedByUserId: string) {
    const source = dto?.source ?? 'mapping';
    if (source !== 'mapping' && source !== 'wiki') {
      throw new BadRequestException('source must be mapping or wiki');
    }

    if (source === 'mapping') {
      const params = {
        source,
        dryRun: dto?.dryRun === true,
        ...(dto?.chunkSize !== undefined ? { chunkSize: dto.chunkSize } : {}),
      };
      return this.runScript('items:mapping:sync', requestedByUserId, params, async () => {
        const result = await this.itemsMappingSyncService.syncFromMapping({
          dryRun: params.dryRun,
          chunkSize: params.chunkSize,
        });
        return { ...result };
      });
    }

    const params = {
      source,
      dryRun: dto?.dryRun === true,
      writeSqlFile: dto?.writeSqlFile,
    };
    return this.runScript('items:wiki:sync', requestedByUserId, params, async () => {
      const result = await this.itemsWikiSyncService.syncFromWiki({
        dryRun: params.dryRun,
        writeSqlFile: params.writeSqlFile,
      });
      return { ...result };
    });
  }

  async runMethodProfitRefresh(requestedByUserId: string) {
    return this.runScript(
      'methods:profits:refresh',
      requestedByUserId,
      {},
      async (): Promise<ScriptResult> => {
        await this.methodProfitRefresherService.refresh();
        return { refreshed: true };
      },
    );
  }

  private async getMethodVariantCounts(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
  }> {
    const rows = await this.variantRepo.query<
      Array<{ method_enabled: boolean | string; variants: string | number }>
    >(
      `
        SELECT
          method.enabled AS method_enabled,
          COUNT(variant.id)::int AS variants
        FROM method_variants variant
        INNER JOIN money_making_methods method ON method.id = variant.method_id
        GROUP BY method.enabled
      `,
    );

    const counts = { total: 0, enabled: 0, disabled: 0 };
    for (const row of rows) {
      const variants = Number(row.variants);
      counts.total += variants;
      if (row.method_enabled === true || row.method_enabled === 'true') {
        counts.enabled += variants;
      } else {
        counts.disabled += variants;
      }
    }

    return counts;
  }

  private async getEnabledMethodVariantsBySkill(): Promise<
    Array<{ skill: string; variants: number }>
  > {
    const rows = await this.variantRepo.query<
      Array<{ skill: string | null; variants: string | number }>
    >(
      `
        WITH enabled_method_skills AS (
          SELECT
            method.id AS method_id,
            LOWER(NULLIF(TRIM(xp_entry.value ->> 'skill'), '')) AS skill_key
          FROM money_making_methods method
          INNER JOIN method_variants xp_variant ON xp_variant.method_id = method.id
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(xp_variant.xp_hour) = 'array' THEN xp_variant.xp_hour
              ELSE '[]'::jsonb
            END
          ) AS xp_entry(value)
          WHERE method.enabled = true
        )
        SELECT
          INITCAP(method_skill.skill_key) AS skill,
          COUNT(DISTINCT variant.id)::int AS variants
        FROM enabled_method_skills method_skill
        INNER JOIN method_variants variant ON variant.method_id = method_skill.method_id
        WHERE method_skill.skill_key IS NOT NULL
        GROUP BY method_skill.skill_key
        ORDER BY method_skill.skill_key ASC
      `,
    );

    return rows.map((row) => ({
      skill: row.skill ?? '',
      variants: Number(row.variants),
    }));
  }

  private async getLatestExecutionsByScript(): Promise<AdminScriptExecution[]> {
    const executions = await this.executionRepo.find({
      order: { startedAt: 'DESC' },
      take: 50,
    });
    const seen = new Set<string>();
    const latest: AdminScriptExecution[] = [];

    for (const execution of executions) {
      if (seen.has(execution.scriptName)) continue;
      seen.add(execution.scriptName);
      latest.push(execution);
    }

    return latest;
  }

  private async runScript(
    scriptName: string,
    requestedByUserId: string,
    params: Record<string, unknown>,
    operation: () => Promise<ScriptResult>,
  ) {
    const startedAt = new Date();
    const execution = await this.executionRepo.save(
      this.executionRepo.create({
        scriptName,
        status: 'running',
        trigger: 'manual',
        requestedByUserId,
        params,
        result: null,
        errorMessage: null,
        startedAt,
        finishedAt: null,
        durationMs: null,
      }),
    );

    try {
      const result = await operation();
      const finishedAt = new Date();
      execution.status = 'succeeded';
      execution.result = result;
      execution.finishedAt = finishedAt;
      execution.durationMs = finishedAt.getTime() - startedAt.getTime();
      const saved = await this.executionRepo.save(execution);
      return { data: saved };
    } catch (error) {
      const finishedAt = new Date();
      execution.status = 'failed';
      execution.errorMessage = this.toErrorMessage(error);
      execution.finishedAt = finishedAt;
      execution.durationMs = finishedAt.getTime() - startedAt.getTime();
      await this.executionRepo.save(execution);
      throw error;
    }
  }

  private parseLimit(limitRaw?: string): number {
    const parsed = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return Math.min(parsed, 100);
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
