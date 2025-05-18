import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { CreateMethodDto } from './dto/create-method.dto';
import { UpdateMethodDto } from './dto/update-method.dto';
import { MethodDto } from './dto/method.dto';
import IORedis, { Redis } from 'ioredis';

// Definimos tipos para mayor seguridad
interface Profit {
  low: number;
  high: number;
}
type ProfitRecord = Record<string, Profit>;

@Injectable()
export class MethodsService {
  constructor(
    @InjectRepository(Method)
    private readonly methodRepo: Repository<Method>,

    @InjectRepository(MethodVariant)
    private readonly variantRepo: Repository<MethodVariant>,

    @InjectRepository(VariantIoItem)
    private readonly ioRepo: Repository<VariantIoItem>,
  ) {}

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
      });
      await this.variantRepo.save(variant);

      for (const input of v.inputs) {
        const io = this.ioRepo.create({
          variant,
          itemId: input.itemId,
          type: 'input',
          quantity: input.quantity,
        });
        await this.ioRepo.save(io);
      }

      for (const output of v.outputs) {
        const io = this.ioRepo.create({
          variant,
          itemId: output.itemId,
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

  async remove(id: string): Promise<void> {
    const result = await this.methodRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Method ${id} not found`);
  }

  async findAllWithProfit(page = 1, perPage = 10): Promise<{ data: any[]; total: number }> {
    const result = await this.findAll(page, perPage);
    const redis: Redis = new IORedis(process.env.REDIS_URL as string);
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
    const enrichedMethods = result.data.map((method) => {
      const methodProfits = allProfits[method.id] ?? {};
      const enrichedVariants = method.variants.map((variant) => {
        const profitKey = method.variants.length === 1 ? method.id : variant.id;
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
      // Eliminamos 'description' destructurando el objeto
      const { description: _description, ...methodWithoutDescription } = method;
      return { ...methodWithoutDescription, variants: enrichedVariants };
    });
    return { data: enrichedMethods, total: result.total };
  }

  async findMethodDetailsWithProfit(id: string): Promise<any> {
    const methodDto = await this.findOne(id);
    const redis: Redis = new IORedis(process.env.REDIS_URL as string);

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

    const enrichedVariants = methodDto.variants.map((variant, index: number) => {
      // Si solo hay una variante se utiliza el id del método; de lo contrario se usa una clave compuesta
      const profitKey =
        methodDto.variants.length === 1 ? methodDto.id : `${methodDto.variants[index].id}`;
      const profit = allProfits[profitKey] ?? { low: 0, high: 0 };

      return {
        ...variant,
        // Se calculan campos a partir de Redis
        clickIntensity: variant.clickIntensity,
        afkiness: variant.afkiness,
        riskLevel: variant.riskLevel,
        requirements: variant.requirements,
        recommendations: variant.recommendations,
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
