import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, Not } from 'typeorm';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { CreateMethodDto } from './dto/create-method.dto';
import { UpdateMethodDto } from './dto/update-method.dto';
import { UpdateMethodBasicDto } from './dto/update-method-basic.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { MethodDto } from './dto/method.dto';
import IORedis, { Redis } from 'ioredis';
import { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';
import { slugify, fallbackSlug } from '../utils/slug';
import {
  VariantRequirements,
  XpHour,
  RequirementLevel,
  RequirementQuest,
  RequirementDiary,
} from './types';

// Definimos tipos para mayor seguridad
interface Profit {
  low: number;
  high: number;
}
type ProfitRecord = Record<string, Profit>;

interface UserInfo {
  levels: Record<string, number>;
  quests: Record<string, number>;
  achievement_diaries: Record<
    string,
    {
      Easy: { complete: boolean; tasks: boolean[] };
      Medium: { complete: boolean; tasks: boolean[] };
      Hard: { complete: boolean; tasks: boolean[] };
      Elite: { complete: boolean; tasks: boolean[] };
    }
  >;
}

interface ListFilters {
  name?: string;
  categories?: string[];
  clickIntensity?: number;
  afkiness?: number;
  riskLevel?: number;
  xpHour?: number;
  skill?: string;
  showProfitables?: boolean;
}

interface SortOptions {
  orderBy?: 'clickIntensity' | 'afkiness' | 'xpHour' | 'highProfit';
  order?: 'asc' | 'desc';
}

export function filterMethodsByUserStats(methods: MethodDto[], userInfo: UserInfo): MethodDto[] {
  // Mapa de quests en minúsculas para búsqueda rápida
  const userQuests = Object.entries(userInfo.quests).reduce(
    (acc, [name, status]) => {
      acc[name.toLowerCase()] = status;
      return acc;
    },
    {} as Record<string, number>,
  );

  return methods.reduce<MethodDto[]>((acc, method) => {
    const validVariants = method.variants.filter((variant) => {
      const req: VariantRequirements = variant.requirements ?? {};
      const { levels: reqLevels, quests: reqQuests, achievement_diaries: reqDiaries } = req;

      if (reqLevels) {
        for (const lvl of reqLevels) {
          if (lvl.skill === 'Combat') {
            for (const stat of ['Strength', 'Defence', 'Attack']) {
              if ((userInfo.levels[stat] ?? 0) < lvl.level) return false;
            }
          } else if ((userInfo.levels[lvl.skill] ?? 0) < lvl.level) {
            return false;
          }
        }
      }

      if (reqQuests) {
        for (const q of reqQuests) {
          if ((userQuests[q.name.toLowerCase()] ?? 0) < q.stage) return false;
        }
      }

      if (reqDiaries) {
        const tierMap = {
          easy: 'Easy',
          medium: 'Medium',
          hard: 'Hard',
          elite: 'Elite',
        } as const;
        for (const d of reqDiaries) {
          const tier = tierMap[d.tier];
          const info = userInfo.achievement_diaries[d.name];
          if (!info?.[tier]?.complete) return false;
        }
      }

      return true;
    });

    if (validVariants.length) {
      acc.push({ ...method, variants: validVariants });
    }
    return acc;
  }, []);
}

export function computeMissingRequirements(
  requirements: VariantRequirements | null,
  userInfo: UserInfo,
): VariantRequirements | null {
  if (!requirements) return null;
  const missing: VariantRequirements = {};

  const { levels, quests, achievement_diaries } = requirements;

  if (levels) {
    const levelMissing: RequirementLevel[] = [];
    for (const lvl of levels) {
      if (lvl.skill === 'Combat') {
        for (const stat of ['Strength', 'Defence', 'Attack']) {
          if ((userInfo.levels[stat] ?? 0) < lvl.level) {
            levelMissing.push({ skill: stat, level: lvl.level });
          }
        }
      } else if ((userInfo.levels[lvl.skill] ?? 0) < lvl.level) {
        levelMissing.push(lvl);
      }
    }
    if (levelMissing.length) missing.levels = levelMissing;
  }

  if (quests) {
    const userQuests = Object.entries(userInfo.quests).reduce(
      (acc, [name, status]) => {
        acc[name.toLowerCase()] = status;
        return acc;
      },
      {} as Record<string, number>,
    );
    const questMissing: RequirementQuest[] = [];
    for (const q of quests) {
      if ((userQuests[q.name.toLowerCase()] ?? 0) < q.stage) {
        questMissing.push(q);
      }
    }
    if (questMissing.length) missing.quests = questMissing;
  }

  if (achievement_diaries) {
    const diaryMissing: RequirementDiary[] = [];
    const tierMap = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      elite: 'Elite',
    } as const;
    for (const d of achievement_diaries) {
      const tier = tierMap[d.tier];
      const info = userInfo.achievement_diaries[d.name];
      if (!info?.[tier]?.complete) {
        diaryMissing.push(d);
      }
    }
    if (diaryMissing.length) missing.achievement_diaries = diaryMissing;
  }

  return Object.keys(missing).length ? missing : null;
}

@Injectable()
export class MethodsService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    @InjectRepository(Method)
    private readonly methodRepo: Repository<Method>,

    @InjectRepository(MethodVariant)
    private readonly variantRepo: Repository<MethodVariant>,

    @InjectRepository(VariantIoItem)
    private readonly ioRepo: Repository<VariantIoItem>,

    @InjectRepository(VariantHistory)
    private readonly historyRepo: Repository<VariantHistory>,

    private readonly snapshotSvc: VariantSnapshotService,
  ) {
    this.redis = new IORedis(process.env.REDIS_URL as string);
  }

  onModuleDestroy() {
    void this.redis.quit();
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
    const { name, description, category, variants } = createDto;
    const method = this.methodRepo.create({ name, description, category });
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
        });
        await this.ioRepo.save(io);
      }

      for (const output of v.outputs) {
        const io = this.ioRepo.create({
          variant,
          itemId: output.id,
          type: 'output',
          quantity: output.quantity,
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

    const { variants = [], name, description, category } = updateDto;

    if (name !== undefined) {
      method.name = name;
      method.slug = await this.generateMethodSlug(name, id);
    }
    if (description !== undefined) method.description = description;
    if (category !== undefined) method.category = category;

    const existingVariants = new Map(method.variants.map((v) => [v.id, v]));
    const updatedVariants: MethodVariant[] = [];

    for (const v of variants) {
      if (v.id && existingVariants.has(v.id)) {
        const variant = existingVariants.get(v.id)!;
        const {
          inputs = [],
          outputs = [],
          snapshotName,
          snapshotDescription,
          snapshotDate,
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
          snapshotName,
          snapshotDescription,
          snapshotDate,
          ...rest
        } = v;
        const variant = this.variantRepo.create({
          method,
          label,
          ...rest,
        });
        variant.slug = await this.generateVariantSlug(method.id, label);
        const newItems: VariantIoItem[] = [];
        for (const input of inputs) {
          newItems.push(
            this.ioRepo.create({
              variant,
              itemId: input.id,
              type: 'input',
              quantity: input.quantity,
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
            }),
          );
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

  async findAllWithProfit(
    page = 1,
    perPage = 10,
    userInfo?: any,
    filters: ListFilters = {},
    sort: SortOptions = { orderBy: 'highProfit', order: 'desc' },
  ): Promise<{ data: any[]; total: number }> {
    // Obtenemos todos los métodos para poder ordenarlos por profit posteriormente
    const allEntities = await this.methodRepo.find({
      relations: ['variants', 'variants.ioItems'],
    });
    const variantCounts = allEntities.reduce<Record<string, number>>((acc, method) => {
      acc[method.id] = method.variants.length;
      return acc;
    }, {});
    let methodsToProcess = allEntities.map((m) => this.toDto(m));

    // Si se pasó el objeto userLevels, filtramos los métodos antes de enriquecerlos
    if (userInfo) {
      methodsToProcess = filterMethodsByUserStats(methodsToProcess, userInfo as UserInfo);
    }

    // Enriquecemos la lista (filtrada o no) con la información de profit proveniente de Redis
    const redis = this.redis; // use the singleton instance
    const rawData = (await redis.call('JSON.GET', 'methodsProfits', '$')) as string | null;
    let allProfits: Record<string, Record<string, { low: number; high: number }>> = {};
    try {
      if (rawData) {
        const parsed = JSON.parse(rawData) as Record<
          string,
          Record<string, { low: number; high: number }>
        >[];
        allProfits = parsed[0] || {};
      }
    } catch {
      allProfits = {};
    }
    const enrichedMethods = methodsToProcess
      .map((method) => {
        const methodProfits = allProfits[method.id] ?? {};
        let enrichedVariants = method.variants.map((variant) => {
          const profitKey = variant.id;
          const profit = methodProfits[profitKey] ?? { low: 0, high: 0 };
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
          if (filters.afkiness != null && v.afkiness != null && v.afkiness > filters.afkiness)
            return false;
          if (
            filters.riskLevel != null &&
            v.riskLevel != null &&
            Number(v.riskLevel) > filters.riskLevel
          )
            return false;
          if (filters.xpHour != null) {
            const hasXp = (v.xpHour?.length ?? 0) > 0;
            if ((filters.xpHour === 1 && !hasXp) || (filters.xpHour === 0 && hasXp)) return false;
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
          filters.categories &&
          filters.categories.length &&
          (!m.category || !filters.categories.includes(m.category))
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

    // Ordenamiento según los parámetros recibidos
    const comparator = (a: number, b: number) => (sort.order === 'asc' ? a - b : b - a);

    const getXpSum = (v: { xpHour?: XpHour | null }): number =>
      v.xpHour?.reduce((acc, val) => acc + val.experience, 0) ?? 0;

    enrichedMethods.sort((a, b) => {
      const va = a.variants[0];
      const vb = b.variants[0];
      switch (sort.orderBy) {
        case 'clickIntensity':
          return comparator(va.clickIntensity ?? 0, vb.clickIntensity ?? 0);
        case 'afkiness':
          return comparator(va.afkiness ?? 0, vb.afkiness ?? 0);
        case 'xpHour':
          return comparator(getXpSum(va), getXpSum(vb));
        case 'highProfit':
        default:
          return comparator(va.highProfit ?? 0, vb.highProfit ?? 0);
      }
    });

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

  async findMethodDetailsWithProfit(id: string, userInfo?: UserInfo): Promise<any> {
    const methodDto = await this.findOne(id);
    const redis = this.redis; // use the singleton instance

    // Obtenemos el snapshot de los profits desde Redis
    const rawData = (await redis.call('JSON.GET', 'methodsProfits', '$')) as string | null;
    let allProfits: ProfitRecord = {};

    try {
      if (rawData) {
        const parsed = JSON.parse(rawData) as Record<string, ProfitRecord>[];
        // Verifica que el id del método coincide con la clave en Redis
        allProfits = parsed[0][methodDto.id] ?? {};
      }
    } catch {
      allProfits = {};
    }

    const enrichedVariants = await Promise.all(
      methodDto.variants.map(async (variant) => {
        // Si solo hay una variante se utiliza el id del método; de lo contrario se usa una clave compuesta
        const profitKey = variant.id;
        const profit = allProfits[profitKey] ?? { low: 0, high: 0 };

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
          trendLastHour: trends.lastHour,
          trendLast24h: trends.last24h,
          trendLastWeek: trends.lastWeek,
          trendLastMonth: trends.lastMonth,
        };
      }),
    );

    return {
      id: methodDto.id,
      name: methodDto.name,
      slug: methodDto.slug,
      description: methodDto.description,
      category: methodDto.category,
      variants: enrichedVariants,
    };
  }
}
