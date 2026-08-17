import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from './auth.types';
import { User } from './entities/user.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { UserTermsAcceptance } from './entities/user-terms-acceptance.entity';
import { CURRENT_TERMS_VERSION } from './terms.constants';

const ACCOUNT_USERNAME_MIN_LENGTH = 3;
const ACCOUNT_USERNAME_MAX_LENGTH = 20;
const ACCOUNT_USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{2,19}$/;
const RESERVED_ACCOUNT_USERNAMES = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'support',
  'staff',
  'root',
  'system',
  'osrstool',
  'rsmethods',
]);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MethodVariant)
    private readonly variantRepo: Repository<MethodVariant>,
    @InjectRepository(UserTermsAcceptance)
    private readonly userTermsAcceptanceRepo: Repository<UserTermsAcceptance>,
  ) {}

  async getCurrentTermsStatusForUser(
    userId: string,
  ): Promise<{ currentVersion: string; accepted: boolean }> {
    const currentAcceptance = await this.userTermsAcceptanceRepo.findOne({
      where: {
        userId,
        termsVersion: CURRENT_TERMS_VERSION,
      },
    });

    return {
      currentVersion: CURRENT_TERMS_VERSION,
      accepted: Boolean(currentAcceptance),
    };
  }

  async getOrCreateUser(authUser: Pick<AuthenticatedUser, 'id' | 'email'>): Promise<User> {
    const existingUser = await this.userRepo.findOne({ where: { id: authUser.id } });
    const nextEmail = authUser.email ?? '';
    let user: User;

    if (!existingUser) {
      user = await this.userRepo.save(
        this.userRepo.create({
          id: authUser.id,
          email: nextEmail,
          accountUsername: null,
          plan: 'free',
          role: 'user',
        }),
      );
    } else if (existingUser.email !== nextEmail) {
      existingUser.email = nextEmail;
      user = await this.userRepo.save(existingUser);
    } else {
      user = existingUser;
    }

    return user;
  }

  async setAccountUsername(
    authUser: Pick<AuthenticatedUser, 'id' | 'email'>,
    username: string,
  ): Promise<User> {
    const user = await this.getOrCreateUser(authUser);

    if (user.accountUsername) {
      throw new ConflictException('Account username is already set and cannot be changed');
    }

    if (typeof username !== 'string') {
      throw new BadRequestException('username is required');
    }

    const normalizedUsername = this.normalizeAccountUsername(username);
    this.validateAccountUsername(normalizedUsername);
    user.accountUsername = normalizedUsername;

    try {
      return await this.userRepo.save(user);
    } catch (error) {
      if (this.isAccountUsernameConflictError(error)) {
        throw new ConflictException('Account username is already taken');
      }

      throw error;
    }
  }

  async getGivenLikesCount(userId: string): Promise<number> {
    return this.variantRepo
      .createQueryBuilder('method_variant')
      .where(':userId = ANY(method_variant.liked_user_ids)', { userId })
      .getCount();
  }

  async acceptCurrentTerms(
    authUser: Pick<AuthenticatedUser, 'id' | 'email'>,
  ): Promise<{ currentVersion: string; accepted: boolean }> {
    const user = await this.getOrCreateUser(authUser);
    const existingAcceptance = await this.userTermsAcceptanceRepo.findOne({
      where: {
        userId: user.id,
        termsVersion: CURRENT_TERMS_VERSION,
      },
    });

    if (existingAcceptance) {
      return {
        currentVersion: CURRENT_TERMS_VERSION,
        accepted: true,
      };
    }

    try {
      await this.userTermsAcceptanceRepo.save(
        this.userTermsAcceptanceRepo.create({
          userId: user.id,
          termsVersion: CURRENT_TERMS_VERSION,
        }),
      );
    } catch (error) {
      if (!this.isTermsAcceptanceConflictError(error)) {
        throw error;
      }
    }

    return {
      currentVersion: CURRENT_TERMS_VERSION,
      accepted: true,
    };
  }

  private normalizeAccountUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  private validateAccountUsername(value: string): void {
    if (!value) {
      throw new BadRequestException('username is required');
    }

    if (value.length < ACCOUNT_USERNAME_MIN_LENGTH || value.length > ACCOUNT_USERNAME_MAX_LENGTH) {
      throw new BadRequestException(
        `username must be between ${ACCOUNT_USERNAME_MIN_LENGTH} and ${ACCOUNT_USERNAME_MAX_LENGTH} characters`,
      );
    }

    if (!ACCOUNT_USERNAME_PATTERN.test(value)) {
      throw new BadRequestException(
        'username must start with a letter or number and contain only lowercase letters, numbers, and underscores',
      );
    }

    if (RESERVED_ACCOUNT_USERNAMES.has(value)) {
      throw new BadRequestException('username is reserved');
    }
  }

  private isAccountUsernameConflictError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: unknown; constraint?: unknown; detail?: unknown };
    if (candidate.code !== '23505') {
      return false;
    }

    return (
      candidate.constraint === 'users_account_username_unique_ci' ||
      candidate.constraint === 'idx_users_account_username_unique_ci' ||
      (typeof candidate.detail === 'string' && candidate.detail.includes('account_username'))
    );
  }

  private isTermsAcceptanceConflictError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: unknown; constraint?: unknown; detail?: unknown };
    if (candidate.code !== '23505') {
      return false;
    }

    return (
      candidate.constraint === 'uq_user_terms_acceptances_user_version' ||
      (typeof candidate.detail === 'string' &&
        candidate.detail.includes('user_id') &&
        candidate.detail.includes('terms_version'))
    );
  }
}
