import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from './auth.types';
import { User } from './entities/user.entity';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Missing authenticated user context');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.role !== 'super_admin') {
      throw new ForbiddenException('Only super_admin can perform this action');
    }

    return true;
  }
}
