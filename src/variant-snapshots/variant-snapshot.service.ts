import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { VariantIoItemSnapshot } from '../methods/entities/io-item-snapshot.entity';
import { MethodVariant } from '../methods/entities/variant.entity';

@Injectable()
export class VariantSnapshotService {
  constructor(
    @InjectRepository(VariantSnapshot)
    private readonly repo: Repository<VariantSnapshot>,
    @InjectRepository(VariantIoItemSnapshot)
    private readonly ioRepo: Repository<VariantIoItemSnapshot>,
  ) {}

  async createFromVariant(
    variant: MethodVariant,
    snapshotName: string,
    snapshotDescription?: string,
    snapshotDate?: string,
  ): Promise<VariantSnapshot> {
    const snapshot = this.repo.create({
      variant,
      method: variant.method,
      label: variant.label,
      actionsPerHour: variant.actionsPerHour,
      xpHour: variant.xpHour,
      clickIntensity: variant.clickIntensity,
      afkiness: variant.afkiness,
      riskLevel: variant.riskLevel,
      requirements: variant.requirements,
      recommendations: variant.recommendations,
      description: variant.description,
      wilderness: variant.wilderness,
      snapshotName,
      snapshotDescription,
      snapshotDate: snapshotDate ? new Date(snapshotDate) : new Date(),
    });
    const saved = await this.repo.save(snapshot);

    if (variant.ioItems?.length) {
      const items = variant.ioItems.map((io) =>
        this.ioRepo.create({
          snapshot: saved,
          itemId: io.itemId,
          quantity: io.quantity,
          type: io.type,
          reason: io.reason ?? null,
        }),
      );
      await this.ioRepo.save(items);
    }

    return saved;
  }

  async remove(id: number): Promise<void> {
    const res = await this.repo.delete(id);
    if (res.affected === 0) {
      throw new NotFoundException(`Snapshot ${id} not found`);
    }
  }
}
