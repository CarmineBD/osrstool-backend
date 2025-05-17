import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { CreateMethodDto } from './dto/create-method.dto';
import { UpdateMethodDto } from './dto/update-method.dto';
import { MethodDto } from './dto/method.dto';

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

    // 1) Crear y guardar el método
    const method = this.methodRepo.create({ name, description, category });
    await this.methodRepo.save(method);

    // 2) Crear y guardar variantes + IO-items
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

    // 3) ¡En lugar de hacer `toDto(method)` aquí, recargamos con relaciones!
    //    De este modo `method.variants[i].ioItems` ya existe y no explota.
    return this.findOne(method.id);
  }

  async findAll(page = 1, perPage = 10): Promise<{ data: MethodDto[]; total: number }> {
    const [methods, total] = await this.methodRepo.findAndCount({
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['variants', 'variants.ioItems'],
      order: { createdAt: 'ASC' },
    });
    return {
      data: methods.map((m) => this.toDto(m)),
      total,
    };
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
    // 1. Preparamos la entidad con los datos nuevos
    const method = await this.methodRepo.preload({ id, ...updateDto });
    if (!method) {
      throw new NotFoundException(`Method ${id} not found`);
    }

    // 2. Guardamos los cambios
    await this.methodRepo.save(method);

    // 3. Re-cargamos la entidad con sus relaciones
    const reloaded = await this.methodRepo.findOne({
      where: { id },
      relations: ['variants', 'variants.ioItems'],
    });
    // (Podrías comprobar aquí !reloaded, pero dado que acabas de guardar, debería existir)

    // 4. Lo convertimos a DTO
    return this.toDto(reloaded!);
  }

  async remove(id: string): Promise<void> {
    const result = await this.methodRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Method ${id} not found`);
  }
}
