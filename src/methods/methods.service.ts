import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { CreateMethodDto } from './dto/create-method.dto';
import { UpdateMethodDto } from './dto/update-method.dto';
import { UpdateMethodBasicDto } from './dto/update-method-basic.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { MethodDto } from './dto/method.dto';
import IORedis, { Redis } from 'ioredis';
import { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';

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
      // Se especifica el tipo esperado para requirements
      const req =
        (variant.requirements as {
          levels?: Record<string, number>;
          quests?: Record<string, number>;
          achievement_diaries?: Record<string, any>;
        }) || {};
      const { levels: reqLevels, quests: reqQuests, achievement_diaries: reqDiaries } = req;
      // 1) Niveles (incluye CombatStats)
      if (reqLevels) {
        const { CombatStats, ...other } = reqLevels;
        for (const skill in other) {
          if ((userInfo.levels[skill] ?? 0) < other[skill]) return false;
        }
        if (CombatStats != null) {
          for (const stat of ['Strength', 'Defence', 'Attack']) {
            if ((userInfo.levels[stat] ?? 0) < CombatStats) return false;
          }
        }
      }

      // 2) Quests (1=started, 2=completed)
      if (reqQuests) {
        for (const q in reqQuests) {
          if ((userQuests[q.toLowerCase()] ?? 0) < reqQuests[q]) return false;
        }
      }

      // 3) Achievement diaries (1=Easy … 4=Elite)
      if (reqDiaries) {
        const levelMap = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Elite' } as const;
        for (const diary in reqDiaries) {
          const tier = levelMap[reqDiaries[diary] as 1 | 2 | 3 | 4];
          const info = userInfo.achievement_diaries[diary];
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
  requirements: {
    levels?: Record<string, number>;
    quests?: Record<string, number>;
    achievement_diaries?: Record<string, any>;
  } | null,
  userInfo: UserInfo,
): any | null {
  if (!requirements) return null;
  const missing: any = {};

  const { levels, quests, achievement_diaries } = requirements;

  if (levels) {
    const { CombatStats, ...other } = levels;
    const levelMissing: Record<string, number> = {};
    for (const skill in other) {
      if ((userInfo.levels[skill] ?? 0) < other[skill]) {
        levelMissing[skill] = other[skill];
      }
    }
    if (CombatStats != null) {
      for (const stat of ['Strength', 'Defence', 'Attack']) {
        if ((userInfo.levels[stat] ?? 0) < CombatStats) {
          levelMissing[stat] = CombatStats;
        }
      }
    }
    if (Object.keys(levelMissing).length) missing.levels = levelMissing;
  }

  if (quests) {
    const userQuests = Object.entries(userInfo.quests).reduce(
      (acc, [name, status]) => {
        acc[name.toLowerCase()] = status;
        return acc;
      },
      {} as Record<string, number>,
    );
    const questMissing: Record<string, number> = {};
    for (const q in quests) {
      if ((userQuests[q.toLowerCase()] ?? 0) < quests[q]) {
        questMissing[q] = quests[q];
      }
    }
    if (Object.keys(questMissing).length) missing.quests = questMissing;
  }

  if (achievement_diaries) {
    const diaryMissing: Record<string, number> = {};
    const levelMap = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Elite' } as const;
    for (const diary in achievement_diaries) {
      const tier = levelMap[achievement_diaries[diary] as 1 | 2 | 3 | 4];
      const info = userInfo.achievement_diaries[diary];
      if (!info?.[tier]?.complete) {
        diaryMissing[diary] = achievement_diaries[diary];
      }
    }
    if (Object.keys(diaryMissing).length) missing.achievement_diaries = diaryMissing;
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

  async create(createDto: CreateMethodDto): Promise<MethodDto> {
    const { name, description, category, variants } = createDto;
    const method = this.methodRepo.create({ name, description, category });
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
        requirements: v.requirements,
        recommendations: v.recommendations,
      });
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
    const method = await this.methodRepo.preload({ id, ...updateDto });
    if (!method) {
      throw new NotFoundException(`Method ${id} not found`);
    }
    await this.methodRepo.save(method);
    const reloaded = await this.methodRepo.findOne({
      where: { id },
      relations: ['variants', 'variants.ioItems'],
    });
    return this.toDto(reloaded!);
  }

  async updateBasic(id: string, updateDto: UpdateMethodBasicDto): Promise<MethodDto> {
    const { variants, ...rest } = updateDto;
    const method = await this.methodRepo.preload({ id, ...rest });
    if (!method) {
      throw new NotFoundException(`Method ${id} not found`);
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
          const { id, clickIntensity, afkiness, riskLevel, requirements, xpHour, label } = variant;
          return {
            id,
            xpHour,
            label,
            clickIntensity,
            afkiness,
            riskLevel,
            requirements,
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
            const hasXp = v.xpHour != null;
            if ((filters.xpHour === 1 && !hasXp) || (filters.xpHour === 0 && hasXp)) return false;
          }
          if (filters.skill && v.xpHour) {
            const skillNames = Object.keys(v.xpHour).map((s) => s.toLowerCase());
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
        const bestVariant = m.variants.sort((a, b) => b.highProfit - a.highProfit)[0];
        const { description: _description, ...methodWithoutDescription } = m;
        return { ...methodWithoutDescription, variants: [bestVariant] };
      });

    // Ordenamiento según los parámetros recibidos
    const comparator = (a: number, b: number) => (sort.order === 'asc' ? a - b : b - a);

    const getXpSum = (v: any): number =>
      (Object.values(v?.xpHour ?? {}) as any[]).reduce(
        (acc: number, val: any) => acc + Number(val ?? 0),
        0,
      );

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

    const enrichedVariants = methodDto.variants.map((variant) => {
      // Si solo hay una variante se utiliza el id del método; de lo contrario se usa una clave compuesta
      const profitKey = variant.id;
      const profit = allProfits[profitKey] ?? { low: 0, high: 0 };

      const missingRequirements = userInfo
        ? computeMissingRequirements(
            (variant.requirements as {
              levels?: Record<string, number>;
              quests?: Record<string, number>;
              achievement_diaries?: Record<string, any>;
            }) || null,
            userInfo,
          )
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
      };
    });

    return {
      id: methodDto.id,
      name: methodDto.name,
      description: methodDto.description,
      category: methodDto.category,
      variants: enrichedVariants,
    };
  }
}
