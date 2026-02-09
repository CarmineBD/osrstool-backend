import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from './auth.types';
import { User } from './entities/user.entity';
import { MethodLike } from '../methods/entities/method-like.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MethodLike)
    private readonly methodLikeRepo: Repository<MethodLike>,
  ) {}

  async getOrCreateUser(authUser: Pick<AuthenticatedUser, 'id' | 'email'>): Promise<User> {
    const existingUser = await this.userRepo.findOne({ where: { id: authUser.id } });
    const nextEmail = authUser.email ?? '';

    if (!existingUser) {
      return this.userRepo.save(
        this.userRepo.create({
          id: authUser.id,
          email: nextEmail,
          plan: 'free',
          role: 'user',
        }),
      );
    }

    if (existingUser.email !== nextEmail) {
      existingUser.email = nextEmail;
      return this.userRepo.save(existingUser);
    }

    return existingUser;
  }

  async getGivenLikesCount(userId: string): Promise<number> {
    return this.methodLikeRepo.count({ where: { userId } });
  }
}
