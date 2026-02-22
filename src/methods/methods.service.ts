import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, Not } from 'typeorm';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { MethodLike } from './entities/method-like.entity';
import { CreateMethodDto } from './dto/create-method.dto';
import { UpdateMethodDto } from './dto/update-method.dto';
import { UpdateMethodBasicDto } from './dto/update-method-basic.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { MethodDto } from './dto/method.dto';
import IORedis, { Redis } from 'ioredis';
import { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';
import { slugify, fallbackSlug } from '../utils/slug';
import { XpHour, UserInfo } from './types';
import { RuneScapeApiService } from './RuneScapeApiService';
import { computeMissingRequirements, filterMethodsByUserStats } from './helpers/requirements';
import { ConfigService } from '@nestjs/config';
import { User } from '../auth/entities/user.entity';
import { calculateMarketImpact } from './market-impact-calculator';

// Definimos tipos para mayor seguridad
interface Profit {
  low: number;
  high: number;
}
type ProfitRecord = Record<string, Profit>;

interface ItemPrice {
  high: number;
  low: number;
}

interface ItemVolume24h {
  high24h?: number;
  low24h?: number;
}

interface VariantIoQuantity {
  id: number;
  quantity: number;
}

interface ListFilters {
  name?: string;
  category?: string;
  clickIntensity?: number;
  afkiness?: number;
  riskLevel?: number;
  givesExperience?: boolean;
  skill?: string;
  showProfitables?: boolean;
  enabled: boolean;
}

interface SortOptions {
  sortBy?: 'clickIntensity' | 'afkiness' | 'xpHour' | 'highProfit' | 'likes';
  order?: 'asc' | 'desc';
}

interface ListQuery {
  page?: string;
  perPage?: string;
  username?: string;
  name?: string;
  category?: string;
  clickIntensity?: string;
  afkiness?: string;
  riskLevel?: string;
  givesExperience?: string;
  skill?: string;
  showProfitables?: string;
  enabled?: string | boolean;
  likedByMe?: string | boolean;
  sortBy?: string;
  order?: string;
  authorization?: string;
}

interface ListLikeOptions {
  likedByUserId?: string;
  onlyLikedByMe?: boolean;
}

interface MethodDetailsWithProfit {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  enabled: boolean;
  likes: number;
  likedByMe?: boolean;
  variants: Array<Record<string, unknown>>;
}

@Injectable()
export class MethodsService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly methodsProfitsHashKey = 'methods:profits';
  private readonly itemPricesHashKey = 'items:prices';
  private readonly itemVolumes24hHashKey = 'items:vol24h';

  constructor(
    @InjectRepository(Method)
    private readonly methodRepo: Repository<Method>,

    @InjectRepository(MethodVariant)
    private readonly variantRepo: Repository<MethodVariant>,

    @InjectRepository(VariantIoItem)
    private readonly ioRepo: Repository<VariantIoItem>,

    @InjectRepository(VariantHistory)
    private readonly historyRepo: Repository<VariantHistory>,

    @InjectRepository(MethodLike)
    private readonly methodLikeRepo: Repository<MethodLike>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly snapshotSvc: VariantSnapshotService,
    private readonly runescapeApi: RuneScapeApiService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new IORedis(redisUrl);
  }

  onModuleDestroy() {
    void this.redis.quit();
  }

  private async fetchUserInfo(username?: string): Promise<{
    userInfo: UserInfo | null;
    warnings: { code: string; message: string }[];
  }> {
    if (!username) return { userInfo: null, warnings: [] };
    try {
      const userInfo = (await this.runescapeApi.fetchUserInfo(username)) as UserInfo;
      return { userInfo, warnings: [] };
    } catch (error: any) {
      const message = `No se pudo obtener la informacion del usuario "${username}".`;
      if (error instanceof Error && error.message.includes('status 404')) {
        return { userInfo: null, warnings: [{ code: 'USER_NOT_FOUND', message }] };
      }
      return { userInfo: null, warnings: [{ code: 'USER_LOOKUP_FAILED', message }] };
    }
  }

  private buildListFilters(query: ListQuery): ListFilters {
    const {
      name,
      category,
      clickIntensity,
      afkiness,
      riskLevel,
      givesExperience,
      skill,
      showProfitables,
      enabled,
    } = query;

    const enabledParsed = this.parseBooleanQueryParam(enabled, 'enabled');

    return {
      name,
      category: category ?? undefined,
      clickIntensity: clickIntensity ? Number(clickIntensity) : undefined,
      afkiness: afkiness ? Number(afkiness) : undefined,
      riskLevel: riskLevel ? Number(riskLevel) : undefined,
      givesExperience:
        givesExperience === 'true' ? true : givesExperience === 'false' ? false : undefined,
      skill: skill ?? undefined,
      showProfitables:
        showProfitables === 'true' ? true : showProfitables === 'false' ? false : undefined,
      enabled: enabledParsed ?? true,
    };
  }

  private parseBooleanQueryParam(
    value: string | boolean | undefined,
    paramName: string,
  ): boolean | undefined {
    if (value == null) return undefined;
    if (typeof value === 'boolean') return value;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;

    throw new BadRequestException(`${paramName} must be a boolean value`);
  }

  private async verifySupabaseToken(authorization?: string): Promise<string> {
    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid Authorization header format. Expected: Bearer <token>',
      );
    }

    const projectUrlRaw = this.config.get<string>('SUPABASE_PROJECT_URL');
    if (!projectUrlRaw || projectUrlRaw.trim().length === 0) {
      throw new UnauthorizedException('Server auth configuration is missing');
    }

    const projectUrl = projectUrlRaw.replace(/\/+$/, '');
    const issuer = `${projectUrl}/auth/v1`;
    const audience = this.config.get<string>('SUPABASE_JWT_AUD')?.trim();

    let jwksUrl: URL;
    try {
      jwksUrl = new URL(`${projectUrl}/auth/v1/.well-known/jwks.json`);
    } catch {
      throw new UnauthorizedException('Invalid Supabase project URL configuration');
    }

    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(jwksUrl);
    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(token, jwks, {
        issuer,
        audience: audience && audience.length > 0 ? audience : undefined,
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const subject = payload.sub;
    if (!subject || typeof subject !== 'string') {
      throw new UnauthorizedException('Authenticated token does not include user id');
    }

    return subject;
  }

  private async resolveAuthenticatedUserId(authorization?: string): Promise<string | null> {
    if (!authorization) return null;
    return this.verifySupabaseToken(authorization);
  }

  private async ensureMethodExists(methodId: string): Promise<void> {
    const methodExists = await this.methodRepo.exists({ where: { id: methodId } });
    if (!methodExists) {
      throw new NotFoundException(`Method ${methodId} not found`);
    }
  }

  private async ensureUserExists(userId: string, email?: string | null): Promise<void> {
    const existingUser = await this.userRepo.findOne({ where: { id: userId } });
    const normalizedEmail = email ?? '';

    if (!existingUser) {
      await this.userRepo.save(
        this.userRepo.create({
          id: userId,
          email: normalizedEmail,
          plan: 'free',
          role: 'user',
        }),
      );
      return;
    }

    if (normalizedEmail.length > 0 && existingUser.email !== normalizedEmail) {
      existingUser.email = normalizedEmail;
      await this.userRepo.save(existingUser);
    }
  }

  private async getLikesCountMap(methodIds: string[]): Promise<Record<string, number>> {
    if (methodIds.length === 0) return {};

    const rows = await this.methodLikeRepo
      .createQueryBuilder('method_like')
      .select('method_like.method_id', 'methodId')
      .addSelect('COUNT(*)', 'likesCount')
      .where('method_like.method_id IN (:...methodIds)', { methodIds })
      .groupBy('method_like.method_id')
      .getRawMany<{ methodId: string; likesCount: string }>();

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.methodId] = Number(row.likesCount);
      return acc;
    }, {});
  }

  private async getLikedMethodIdsByUser(userId: string, methodIds: string[]): Promise<Set<string>> {
    if (methodIds.length === 0) return new Set<string>();

    const rows = await this.methodLikeRepo.find({
      where: {
        userId,
        methodId: In(methodIds),
      },
      select: {
        methodId: true,
      },
    });

    return new Set(rows.map((row) => row.methodId));
  }

  async likeMethod(methodId: string, userId: string, email?: string | null): Promise<void> {
    await this.ensureMethodExists(methodId);
    await this.ensureUserExists(userId, email);

    await this.methodLikeRepo
      .createQueryBuilder()
      .insert()
      .into(MethodLike)
      .values({ methodId, userId, createdAt: new Date() })
      .orIgnore()
      .execute();
  }

  async unlikeMethod(methodId: string, userId: string): Promise<void> {
    await this.ensureMethodExists(methodId);
    await this.methodLikeRepo.delete({ methodId, userId });
  }

  private async assertSuperAdminForDisabledMethods(authorization?: string): Promise<void> {
    // Accessing disabled methods is an admin-only capability.
    // We require a valid Supabase JWT and then enforce role from our DB users table.
    const userId = await this.verifySupabaseToken(authorization);
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user || user.role !== 'super_admin') {
      throw new ForbiddenException('Only super_admin can request enabled=false');
    }
  }

  private async assertCanAccessMethodDetails(
    methodId: string,
    authorization?: string,
    authenticatedUserId?: string | null,
  ): Promise<void> {
    const method = await this.methodRepo.findOne({
      where: { id: methodId },
      select: { id: true, enabled: true },
    });

    if (!method) {
      throw new NotFoundException(`Method ${methodId} not found`);
    }

    if (method.enabled) {
      return;
    }

    const userId = authenticatedUserId ?? (await this.verifySupabaseToken(authorization));
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.role !== 'super_admin') {
      throw new ForbiddenException('Only super_admin can access disabled methods');
    }
  }

  private async assertRegisteredUserForUsername(
    username?: string,
    authorization?: string,
    authenticatedUserId?: string | null,
  ): Promise<void> {
    if (!username) return;

    const userId = authenticatedUserId ?? (await this.verifySupabaseToken(authorization));
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new ForbiddenException('Only registered users can use username query parameter');
    }
  }

  private buildSortOptions(query: ListQuery): SortOptions {
    const { sortBy = 'highProfit', order = 'desc' } = query;
    return {
      sortBy: sortBy as 'clickIntensity' | 'afkiness' | 'xpHour' | 'highProfit' | 'likes',
      order: (order as 'asc' | 'desc') ?? 'desc',
    };
  }

  async listWithProfitResponse(query: ListQuery) {
    const { page = '1', perPage = '10', username } = query;
    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);
    const likedByMeFilter = this.parseBooleanQueryParam(query.likedByMe, 'likedByMe');
    const authenticatedUserId = await this.resolveAuthenticatedUserId(query.authorization);

    if (likedByMeFilter && !authenticatedUserId) {
      throw new UnauthorizedException('likedByMe filter requires authentication');
    }

    await this.assertRegisteredUserForUsername(username, query.authorization, authenticatedUserId);
    const { userInfo, warnings } = await this.fetchUserInfo(username);
    const filters = this.buildListFilters(query);
    if (filters.enabled === false) {
      await this.assertSuperAdminForDisabledMethods(query.authorization);
    }
    const sortOptions = this.buildSortOptions(query);

    const result = await this.findAllWithProfit(
      p,
      pp,
      userInfo ?? undefined,
      filters,
      sortOptions,
      {
        likedByUserId: authenticatedUserId ?? undefined,
        onlyLikedByMe: likedByMeFilter === true,
      },
    );

    const hasNext = p * pp < result.total;

    const meta = {
      total: result.total,
      page: p,
      pageSize: pp,
      perPage: pp, // Backward-compatible alias for existing clients.
      hasNext,
      ...(username ? { username } : {}),
    };

    return {
      status: warnings.length ? 'partial' : 'ok',
      data: { methods: result.data, user: userInfo },
      warnings,
      meta,
    };
  }

  async methodDetailsWithProfitResponse(id: string, username?: string, authorization?: string) {
    const authenticatedUserId = await this.resolveAuthenticatedUserId(authorization);
    await this.assertCanAccessMethodDetails(id, authorization, authenticatedUserId);
    await this.assertRegisteredUserForUsername(username, authorization, authenticatedUserId);
    const { userInfo, warnings } = await this.fetchUserInfo(username);
    const method = await this.findMethodDetailsWithProfit(
      id,
      userInfo ?? undefined,
      authenticatedUserId ?? undefined,
    );

    return {
      status: warnings.length ? 'partial' : 'ok',
      data: { method, user: userInfo },
      warnings,
      meta: {
        ...(username ? { username } : {}),
      },
    };
  }

  async methodDetailsWithProfitResponseBySlug(
    slug: string,
    username?: string,
    authorization?: string,
  ) {
    const method = await this.methodRepo.findOne({ where: { slug } });
    if (!method) throw new NotFoundException(`Method with slug ${slug} not found`);
    return this.methodDetailsWithProfitResponse(method.id, username, authorization);
  }

  private toDto(entity: Method): MethodDto {
    return MethodDto.fromEntity(entity);
  }

  private async generateMethodSlug(name: string, excludeId?: string): Promise<string> {
    let base = slugify(name);
    if (!base) {
      base = fallbackSlug('mmm');
    }
    base = base.slice(0, 160);
    let slug = base;
    let count = 2;
    while (
      await this.methodRepo.count({
        where: { slug, ...(excludeId ? { id: Not(excludeId) } : {}) },
      })
    ) {
      const suffix = `-${count}`;
      const trimmed = base.slice(0, 160 - suffix.length);
      slug = `${trimmed}${suffix}`;
      count += 1;
    }
    return slug;
  }

  private async generateVariantSlug(
    methodId: string,
    label: string,
    excludeId?: string,
  ): Promise<string> {
    let base = slugify(label);
    if (!base) {
      base = fallbackSlug('variant');
    }
    base = base.slice(0, 160);
    let slug = base;
    let count = 2;
    while (
      await this.variantRepo.count({
        where: {
          method: { id: methodId },
          slug,
          ...(excludeId ? { id: Not(excludeId) } : {}),
        },
      })
    ) {
      const suffix = `-${count}`;
      const trimmed = base.slice(0, 160 - suffix.length);
      slug = `${trimmed}${suffix}`;
      count += 1;
    }
    return slug;
  }

  async create(createDto: CreateMethodDto): Promise<MethodDto> {
    const { name, description, category, enabled, variants } = createDto;
    const method = this.methodRepo.create({ name, description, category, enabled });
    method.slug = await this.generateMethodSlug(name);
    await this.methodRepo.save(method);

    for (const v of variants) {
      const variant = this.variantRepo.create({
        method,
        label: v.label,
        actionsPerHour: v.actionsPerHour,
        xpHour: v.xpHour,
        clickIntensity: v.clickIntensity,
        afkiness: v.afkiness,
        riskLevel: v.riskLevel,
        description: v.description ?? null,
        wilderness: v.wilderness ?? false,
        requirements: v.requirements,
        recommendations: v.recommendations,
      });
      variant.slug = await this.generateVariantSlug(method.id, v.label);
      await this.variantRepo.save(variant);

      for (const input of v.inputs) {
        const io = this.ioRepo.create({
          variant,
          itemId: input.id,
          type: 'input',
          quantity: input.quantity,
          reason: input.reason ?? null,
        });
        await this.ioRepo.save(io);
      }

      for (const output of v.outputs) {
        const io = this.ioRepo.create({
          variant,
          itemId: output.id,
          type: 'output',
          quantity: output.quantity,
          reason: output.reason ?? null,
        });
        await this.ioRepo.save(io);
      }
    }
    return this.findOne(method.id);
  }

  async findAll(page = 1, perPage = 10): Promise<{ data: MethodDto[]; total: number }> {
    const [methods, total] = await this.methodRepo.findAndCount({
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['variants', 'variants.ioItems'],
      order: { createdAt: 'ASC' },
    });
    return { data: methods.map((m) => this.toDto(m)), total };
  }

  async findOne(id: string): Promise<MethodDto> {
    const method = await this.methodRepo.findOne({
      where: { id },
      relations: ['variants', 'variants.ioItems'],
    });
    if (!method) throw new NotFoundException(`Method ${id} not found`);
    return this.toDto(method);
  }

  async update(id: string, updateDto: UpdateMethodDto): Promise<MethodDto> {
    const method = await this.methodRepo.findOne({
      where: { id },
      relations: ['variants', 'variants.ioItems'],
    });
    if (!method) {
      throw new NotFoundException(`Method ${id} not found`);
    }

    const { variants = [], name, description, category, enabled } = updateDto;

    if (name !== undefined) {
      method.name = name;
      method.slug = await this.generateMethodSlug(name, id);
    }
    if (description !== undefined) method.description = description;
    if (category !== undefined) method.category = category;
    if (enabled !== undefined) method.enabled = enabled;

    const existingVariants = new Map(method.variants.map((v) => [v.id, v]));
    const updatedVariants: MethodVariant[] = [];

    for (const v of variants) {
      if (v.id && existingVariants.has(v.id)) {
        const variant = existingVariants.get(v.id)!;
        const {
          inputs = [],
          outputs = [],
          snapshotName: _snapshotName,
          snapshotDescription: _snapshotDescription,
          snapshotDate: _snapshotDate,
          ...rest
        } = v;
        Object.assign(variant, rest);

        if (v.label) {
          variant.slug = await this.generateVariantSlug(method.id, v.label, v.id);
        }

        await this.ioRepo.delete({ variant: { id: variant.id } });
        const newItems: VariantIoItem[] = [];
        for (const input of inputs) {
          newItems.push(
            this.ioRepo.create({
              variant,
              itemId: input.id,
              type: 'input',
              quantity: input.quantity,
              reason: input.reason ?? null,
            }),
          );
        }
        for (const output of outputs) {
          newItems.push(
            this.ioRepo.create({
              variant,
              itemId: output.id,
              type: 'output',
              quantity: output.quantity,
              reason: output.reason ?? null,
            }),
          );
        }
        variant.ioItems = newItems;
        updatedVariants.push(variant);
      } else {
        const {
          inputs = [],
          outputs = [],
          label = '',
          snapshotName: _snapshotName,
          snapshotDescription: _snapshotDescription,
          snapshotDate: _snapshotDate,
          ...rest
        } = v;
        const variant = this.variantRepo.create({
          method,
          label,
          ...rest,
        });
        variant.slug = await this.generateVariantSlug(method.id, label);
        await this.variantRepo.save(variant);
        const newItems: VariantIoItem[] = [];
        for (const input of inputs) {
          newItems.push(
            this.ioRepo.create({
              variant,
              itemId: input.id,
              type: 'input',
              quantity: input.quantity,
              reason: input.reason ?? null,
            }),
          );
        }
        for (const output of outputs) {
          newItems.push(
            this.ioRepo.create({
              variant,
              itemId: output.id,
              type: 'output',
              quantity: output.quantity,
              reason: output.reason ?? null,
            }),
          );
        }
        if (newItems.length) {
          await this.ioRepo.save(newItems);
        }
        variant.ioItems = newItems;
        updatedVariants.push(variant);
      }
    }

    const dtoIds = new Set(variants.filter((v) => v.id).map((v) => v.id!));
    const toRemove = method.variants.filter((v) => !dtoIds.has(v.id));
    if (toRemove.length) {
      await this.variantRepo.delete(toRemove.map((v) => v.id));
    }

    method.variants = updatedVariants;
    await this.methodRepo.save(method);
    return this.findOne(id);
  }

  async updateBasic(id: string, updateDto: UpdateMethodBasicDto): Promise<MethodDto> {
    const { variants, ...rest } = updateDto;
    const method = await this.methodRepo.preload({ id, ...rest });
    if (!method) {
      throw new NotFoundException(`Method ${id} not found`);
    }
    if (rest.name) {
      method.slug = await this.generateMethodSlug(rest.name, id);
    }
    if (variants) {
      const variantEntities = await this.variantRepo.find({
        where: { id: In(variants) },
      });
      method.variants = variantEntities;
    }
    await this.methodRepo.save(method);
    const reloaded = await this.methodRepo.findOne({
      where: { id },
      relations: ['variants', 'variants.ioItems'],
    });
    return this.toDto(reloaded!);
  }

  async updateVariant(
    id: string,
    dto: UpdateVariantDto,
    generateSnapshot = false,
  ): Promise<MethodDto> {
    const variant = await this.variantRepo.findOne({
      where: { id },
      relations: ['ioItems', 'method'],
    });
    if (!variant) throw new NotFoundException(`Variant ${id} not found`);
    const {
      inputs = [],
      outputs = [],
      snapshotName,
      snapshotDescription,
      snapshotDate,
      ...rest
    } = dto;
    Object.assign(variant, rest);

    if (dto.label) {
      variant.slug = await this.generateVariantSlug(variant.method.id, dto.label, id);
    }

    // Remove existing IO items to avoid duplicates
    await this.ioRepo.delete({ variant: { id } });

    const newItems: VariantIoItem[] = [];
    for (const input of inputs) {
      newItems.push(
        this.ioRepo.create({
          variant,
          itemId: input.id,
          type: 'input',
          quantity: input.quantity,
          reason: input.reason ?? null,
        }),
      );
    }
    for (const output of outputs) {
      newItems.push(
        this.ioRepo.create({
          variant,
          itemId: output.id,
          type: 'output',
          quantity: output.quantity,
          reason: output.reason ?? null,
        }),
      );
    }

    variant.ioItems = newItems;
    await this.variantRepo.save(variant);

    if (generateSnapshot) {
      if (!snapshotName) {
        throw new BadRequestException('snapshotName is required when generateSnapshot is true');
      }
      await this.snapshotSvc.createFromVariant(
        variant,
        snapshotName,
        snapshotDescription,
        snapshotDate,
      );
    }

    return this.findOne(variant.method.id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.methodRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Method ${id} not found`);
  }

  private parseProfitRecord(value: unknown): ProfitRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const parsed: ProfitRecord = {};

    for (const [variantId, candidate] of Object.entries(record)) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }

      const maybeProfit = candidate as Record<string, unknown>;
      if (typeof maybeProfit.low !== 'number' || typeof maybeProfit.high !== 'number') {
        continue;
      }

      parsed[variantId] = {
        low: maybeProfit.low,
        high: maybeProfit.high,
      };
    }

    return parsed;
  }

  private parseProfitRecordString(raw: unknown): ProfitRecord | null {
    const rawText =
      typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null;
    if (!rawText) return null;

    try {
      return this.parseProfitRecord(JSON.parse(rawText));
    } catch {
      return null;
    }
  }

  private parseHashProfits(raw: unknown): Record<string, ProfitRecord> {
    const result: Record<string, ProfitRecord> = {};

    if (Array.isArray(raw)) {
      const entries = raw as unknown[];
      for (let i = 0; i < entries.length; i += 2) {
        const field = entries[i];
        const value = entries[i + 1];
        if (typeof field !== 'string') continue;
        result[field] = this.parseProfitRecordString(value) ?? {};
      }
      return result;
    }

    if (!raw || typeof raw !== 'object') {
      return result;
    }

    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
      result[field] = this.parseProfitRecordString(value) ?? {};
    }

    return result;
  }

  private async getAllMethodsProfits(): Promise<Record<string, ProfitRecord>> {
    const hashRaw = await this.redis.call('HGETALL', this.methodsProfitsHashKey);
    return this.parseHashProfits(hashRaw);
  }

  private async getMethodProfits(methodId: string): Promise<ProfitRecord> {
    const hashRaw = await this.redis.call('HGET', this.methodsProfitsHashKey, methodId);
    return this.parseProfitRecordString(hashRaw) ?? {};
  }

  private toNonNegativeNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value >= 0 ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed >= 0 ? parsed : 0;
      }
    }

    return null;
  }

  private parseItemPrice(raw: unknown): ItemPrice | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const candidate = raw as Record<string, unknown>;
    const low = this.toNonNegativeNumberOrNull(candidate.low);
    if (low === null) {
      return null;
    }

    const high = this.toNonNegativeNumberOrNull(candidate.high) ?? low;
    return { high, low };
  }

  private parseJsonValue(raw: unknown): unknown {
    const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null;
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private async getItemPrices(ids: number[]): Promise<Record<number, ItemPrice>> {
    if (ids.length === 0) return {};

    const fields = ids.map(String);
    const hashRaw = await this.redis.call('HMGET', this.itemPricesHashKey, ...fields);
    const rows: unknown[] = Array.isArray(hashRaw) ? hashRaw : [];

    const result: Record<number, ItemPrice> = {};
    for (let i = 0; i < ids.length; i += 1) {
      const parsed = this.parseJsonValue(rows[i]);
      const price = this.parseItemPrice(parsed);
      if (!price) continue;
      result[ids[i]] = price;
    }

    return result;
  }

  private parseItemVolume24h(raw: unknown): ItemVolume24h | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const candidate = raw as Record<string, unknown>;
    const high24h = this.toNonNegativeNumberOrNull(candidate.high24h);
    const low24h = this.toNonNegativeNumberOrNull(candidate.low24h);

    if (high24h === null && low24h === null) {
      return null;
    }

    return {
      ...(high24h !== null ? { high24h } : {}),
      ...(low24h !== null ? { low24h } : {}),
    };
  }

  private async getItemVolumes24h(ids: number[]): Promise<Record<number, ItemVolume24h>> {
    if (ids.length === 0) return {};

    const fields = ids.map(String);
    const hashRaw = await this.redis.call('HMGET', this.itemVolumes24hHashKey, ...fields);
    const rows: unknown[] = Array.isArray(hashRaw) ? hashRaw : [];

    const result: Record<number, ItemVolume24h> = {};
    for (let i = 0; i < ids.length; i += 1) {
      const parsed = this.parseJsonValue(rows[i]);
      const itemVolume = this.parseItemVolume24h(parsed);
      if (!itemVolume) continue;
      result[ids[i]] = itemVolume;
    }

    return result;
  }

  private collectItemIdsFromVariants(
    variants: Array<{ inputs: VariantIoQuantity[]; outputs: VariantIoQuantity[] }>,
  ): number[] {
    const ids = new Set<number>();

    for (const variant of variants) {
      for (const input of variant.inputs) {
        if (Number.isInteger(input.id) && input.id > 0) ids.add(input.id);
      }
      for (const output of variant.outputs) {
        if (Number.isInteger(output.id) && output.id > 0) ids.add(output.id);
      }
    }

    return [...ids];
  }

  private collectItemIdsFromMethods(methods: MethodDto[]): number[] {
    const variants = methods.flatMap((method) => method.variants);
    return this.collectItemIdsFromVariants(variants);
  }

  private calculateVariantMarketImpact(
    variant: { inputs: VariantIoQuantity[]; outputs: VariantIoQuantity[] },
    pricesByItem: Record<number, ItemPrice>,
    volumes24hByItem: Record<number, ItemVolume24h>,
  ): { marketImpactInstant: number; marketImpactSlow: number } {
    return calculateMarketImpact({
      inputs: variant.inputs,
      outputs: variant.outputs,
      pricesByItem,
      volumes24hByItem,
    });
  }

  async findAllWithProfit(
    page = 1,
    perPage = 10,
    userInfo?: UserInfo,
    filters: ListFilters = { enabled: true },
    sort: SortOptions = { sortBy: 'highProfit', order: 'desc' },
    likeOptions: ListLikeOptions = {},
  ): Promise<{ data: any[]; total: number }> {
    // Obtenemos todos los métodos para poder ordenarlos por profit posteriormente
    const allEntities = await this.methodRepo.find({
      where: { enabled: filters.enabled },
      relations: ['variants', 'variants.ioItems'],
    });
    const variantCounts = allEntities.reduce<Record<string, number>>((acc, method) => {
      acc[method.id] = method.variants.length;
      return acc;
    }, {});
    let methodsToProcess = allEntities.map((m) => this.toDto(m));

    // Si se pasó el objeto userLevels, filtramos los métodos antes de enriquecerlos
    if (userInfo) {
      methodsToProcess = filterMethodsByUserStats(methodsToProcess, userInfo);
    }

    // Enriquecemos la lista (filtrada o no) con la información de profit proveniente de Redis
    const itemIds = this.collectItemIdsFromMethods(methodsToProcess);
    const [allProfits, pricesByItem, volumes24hByItem] = await Promise.all([
      this.getAllMethodsProfits(),
      this.getItemPrices(itemIds),
      this.getItemVolumes24h(itemIds),
    ]);

    let enrichedMethods = methodsToProcess
      .map((method) => {
        const methodProfits = allProfits[method.id] ?? {};
        let enrichedVariants = method.variants.map((variant) => {
          const profitKey = variant.id;
          const profit = methodProfits[profitKey] ?? { low: 0, high: 0 };
          const marketImpact = this.calculateVariantMarketImpact(
            variant,
            pricesByItem,
            volumes24hByItem,
          );
          const {
            id,
            slug,
            clickIntensity,
            afkiness,
            riskLevel,
            requirements,
            xpHour,
            label,
            description,
            wilderness,
          } = variant;
          return {
            id,
            slug,
            xpHour,
            label,
            description,
            clickIntensity,
            afkiness,
            riskLevel,
            requirements,
            wilderness,
            lowProfit: profit.low,
            highProfit: profit.high,
            marketImpactInstant: marketImpact.marketImpactInstant,
            marketImpactSlow: marketImpact.marketImpactSlow,
          };
        });

        // Filtrado por propiedades de variant
        enrichedVariants = enrichedVariants.filter((v) => {
          if (
            filters.clickIntensity != null &&
            v.clickIntensity != null &&
            v.clickIntensity > filters.clickIntensity
          )
            return false;
          if (filters.afkiness != null) {
            if (v.afkiness == null || v.afkiness <= filters.afkiness) return false;
          }
          if (
            filters.riskLevel != null &&
            v.riskLevel != null &&
            Number(v.riskLevel) > filters.riskLevel
          )
            return false;
          if (filters.givesExperience != null) {
            const hasXp = (v.xpHour?.length ?? 0) > 0;
            if ((filters.givesExperience && !hasXp) || (!filters.givesExperience && hasXp))
              return false;
          }
          if (filters.skill && v.xpHour) {
            const skillNames = v.xpHour.map((s) => s.skill.toLowerCase());
            if (!skillNames.includes(filters.skill.toLowerCase())) return false;
          }
          if (filters.showProfitables && v.highProfit <= 0) return false;
          return true;
        });

        return { ...method, variants: enrichedVariants };
      })
      .filter((m) => {
        if (filters.name && !m.name.toLowerCase().includes(filters.name.toLowerCase()))
          return false;
        if (
          filters.category &&
          (!m.category || m.category.toLowerCase() !== filters.category.toLowerCase())
        )
          return false;
        return m.variants.length > 0;
      })
      .map((m) => {
        const variantCount = variantCounts[m.id] ?? 0;
        const bestVariant = m.variants.sort((a, b) => b.highProfit - a.highProfit)[0];
        const { description: _description, ...methodWithoutDescription } = m;
        return { ...methodWithoutDescription, variants: [bestVariant], variantCount };
      });

    const methodIds = enrichedMethods.map((method) => method.id);
    const likesCountMap = await this.getLikesCountMap(methodIds);
    const likedMethodIds = likeOptions.likedByUserId
      ? await this.getLikedMethodIdsByUser(likeOptions.likedByUserId, methodIds)
      : new Set<string>();

    enrichedMethods = enrichedMethods.map((method) => ({
      ...method,
      likes: likesCountMap[method.id] ?? 0,
      ...(likeOptions.likedByUserId ? { likedByMe: likedMethodIds.has(method.id) } : {}),
    }));

    if (likeOptions.onlyLikedByMe) {
      enrichedMethods = enrichedMethods.filter((method) =>
        likeOptions.likedByUserId ? likedMethodIds.has(method.id) : false,
      );
    }

    // Ordenamiento según los parámetros recibidos
    const comparator = (a: number, b: number) => (sort.order === 'asc' ? a - b : b - a);

    const getXpSum = (v: { xpHour?: XpHour | null }): number =>
      v.xpHour?.reduce((acc, val) => acc + val.experience, 0) ?? 0;

    enrichedMethods.sort(
      (
        a: {
          likes?: number;
          variants: Array<{
            clickIntensity?: number | null;
            afkiness?: number | null;
            xpHour?: XpHour | null;
            highProfit?: number | null;
          }>;
        },
        b: {
          likes?: number;
          variants: Array<{
            clickIntensity?: number | null;
            afkiness?: number | null;
            xpHour?: XpHour | null;
            highProfit?: number | null;
          }>;
        },
      ) => {
        const va = a.variants[0];
        const vb = b.variants[0];
        switch (sort.sortBy) {
          case 'clickIntensity':
            return comparator(va.clickIntensity ?? 0, vb.clickIntensity ?? 0);
          case 'afkiness':
            return comparator(va.afkiness ?? 0, vb.afkiness ?? 0);
          case 'xpHour':
            // For xpHour sorting, use the total experience sum of the variant.
            return comparator(getXpSum(va), getXpSum(vb));
          case 'likes': {
            const likesA = a.likes ?? 0;
            const likesB = b.likes ?? 0;
            return comparator(likesA, likesB);
          }
          case 'highProfit':
          default:
            return comparator(va.highProfit ?? 0, vb.highProfit ?? 0);
        }
      },
    );

    const total = enrichedMethods.length;
    const start = (page - 1) * perPage;
    const paginated = enrichedMethods.slice(start, start + perPage);

    return { data: paginated, total };
  }

  private async computeTrend(
    variantId: string,
    currentHigh: number,
  ): Promise<{
    lastHour: number | null;
    last24h: number | null;
    lastWeek: number | null;
    lastMonth: number | null;
  }> {
    const now = new Date();
    const ranges = {
      lastHour: 60 * 60 * 1000,
      last24h: 24 * 60 * 60 * 1000,
      lastWeek: 7 * 24 * 60 * 60 * 1000,
      lastMonth: 30 * 24 * 60 * 60 * 1000,
    } as const;

    const trends: Record<keyof typeof ranges, number | null> = {
      lastHour: null,
      last24h: null,
      lastWeek: null,
      lastMonth: null,
    };

    await Promise.all(
      Object.entries(ranges).map(async ([key, ms]) => {
        const pastDate = new Date(now.getTime() - ms);
        const past = await this.historyRepo.findOne({
          where: {
            variant: { id: variantId },
            timestamp: LessThanOrEqual(pastDate),
          },
          order: { timestamp: 'DESC' },
        });

        if (past?.highProfit && Number(past.highProfit) !== 0) {
          const pastHigh = Number(past.highProfit);
          trends[key as keyof typeof ranges] = ((currentHigh - pastHigh) / pastHigh) * 100;
        }
      }),
    );

    return trends;
  }

  async findMethodDetailsWithProfit(
    id: string,
    userInfo?: UserInfo,
    likedByUserId?: string,
  ): Promise<MethodDetailsWithProfit> {
    const methodDto = await this.findOne(id);
    const itemIds = this.collectItemIdsFromVariants(methodDto.variants);
    const [allProfits, pricesByItem, volumes24hByItem] = await Promise.all([
      this.getMethodProfits(methodDto.id),
      this.getItemPrices(itemIds),
      this.getItemVolumes24h(itemIds),
    ]);

    const enrichedVariants = await Promise.all(
      methodDto.variants.map(async (variant) => {
        // Si solo hay una variante se utiliza el id del método; de lo contrario se usa una clave compuesta
        const profitKey = variant.id;
        const profit = allProfits[profitKey] ?? { low: 0, high: 0 };
        const marketImpact = this.calculateVariantMarketImpact(
          variant,
          pricesByItem,
          volumes24hByItem,
        );

        const trends = await this.computeTrend(variant.id, profit.high);

        const missingRequirements = userInfo
          ? computeMissingRequirements(variant.requirements ?? null, userInfo)
          : null;

        return {
          ...variant,
          // Se calculan campos a partir de Redis
          clickIntensity: variant.clickIntensity,
          afkiness: variant.afkiness,
          riskLevel: variant.riskLevel,
          requirements: variant.requirements,
          recommendations: variant.recommendations,
          missingRequirements,
          lowProfit: profit.low,
          highProfit: profit.high,
          marketImpactInstant: marketImpact.marketImpactInstant,
          marketImpactSlow: marketImpact.marketImpactSlow,
          trendLastHour: trends.lastHour,
          trendLast24h: trends.last24h,
          trendLastWeek: trends.lastWeek,
          trendLastMonth: trends.lastMonth,
        };
      }),
    );
    const [likes, likedByMe] = await Promise.all([
      this.methodLikeRepo.count({ where: { methodId: methodDto.id } }),
      likedByUserId
        ? this.methodLikeRepo.exists({
            where: { methodId: methodDto.id, userId: likedByUserId },
          })
        : Promise.resolve(false),
    ]);

    return {
      id: methodDto.id,
      name: methodDto.name,
      slug: methodDto.slug,
      description: methodDto.description,
      category: methodDto.category,
      enabled: methodDto.enabled,
      likes,
      ...(likedByUserId ? { likedByMe } : {}),
      variants: enrichedVariants,
    };
  }
}
