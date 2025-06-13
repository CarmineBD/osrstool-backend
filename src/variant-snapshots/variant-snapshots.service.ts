import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';

@Injectable()
export class VariantSnapshotsService {
  constructor(
    @InjectRepository(VariantSnapshot)
    private readonly repo: Repository<VariantSnapshot>,
  ) {}

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (res.affected === 0) {
      throw new NotFoundException(`Snapshot ${id} not found`);
    }
  }
}
