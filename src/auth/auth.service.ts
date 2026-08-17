import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from './auth.types';
import { User } from './entities/user.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { UserTermsAcceptance } from './entities/user-terms-acceptance.entity';
import { CURRENT_TERMS_VERSION } from './terms.constants';
import { RedisService } from '../redis/redis.service';
import {
  buildDeletedUserAuthKey,
  resolveDeletedUserAuthTtlSeconds,
} from './deleted-user-auth.util';

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MethodVariant)
    private readonly variantRepo: Repository<MethodVariant>,
    @InjectRepository(UserTermsAcceptance)
    private readonly userTermsAcceptanceRepo: Repository<UserTermsAcceptance>,
    private readonly config: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
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

  async deleteAuthenticatedUser(
    authUser: Pick<AuthenticatedUser, 'id'> & { exp?: unknown },
  ): Promise<void> {
    const userId = authUser.id?.trim();
    if (!userId) {
      throw new BadRequestException('Authenticated user id is required');
    }

    const adminConfig = this.getSupabaseAdminConfig();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          UPDATE method_variants
          SET
            liked_user_ids = array_remove(COALESCE(liked_user_ids, ARRAY[]::text[]), $1),
            likes_count = CARDINALITY(
              array_remove(COALESCE(liked_user_ids, ARRAY[]::text[]), $1)
            )
          WHERE $1 = ANY(COALESCE(liked_user_ids, ARRAY[]::text[]))
        `,
        [userId],
      );
      await manager.query(
        `
          UPDATE admin_script_executions
          SET requested_by_user_id = NULL
          WHERE requested_by_user_id = $1
        `,
        [userId],
      );
      await manager.query(`DELETE FROM public.user_terms_acceptances WHERE user_id = $1`, [userId]);
      await manager.query(`DELETE FROM public.users WHERE id = $1`, [userId]);
    });

    await this.deleteUserFromSupabase(userId, adminConfig);
    await this.markDeletedUserAccess(userId, authUser.exp);
    await this.clearPresenceMembership(userId);
  }

  private normalizeAccountUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  private getSupabaseAdminConfig(): { projectUrl: string; serviceRoleKey: string } {
    const projectUrlRaw = this.config.get<string>('SUPABASE_PROJECT_URL')?.trim();
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!projectUrlRaw || !serviceRoleKey) {
      throw new ServiceUnavailableException({
        code: 'SUPABASE_ADMIN_CONFIG_MISSING',
        message: 'Supabase admin configuration is missing',
      });
    }

    let projectUrl: URL;
    try {
      projectUrl = new URL(projectUrlRaw);
    } catch {
      throw new ServiceUnavailableException({
        code: 'SUPABASE_ADMIN_CONFIG_INVALID',
        message: 'Invalid Supabase project URL configuration',
      });
    }

    return {
      projectUrl: projectUrl.toString().replace(/\/+$/, ''),
      serviceRoleKey,
    };
  }

  private async deleteUserFromSupabase(
    userId: string,
    adminConfig: { projectUrl: string; serviceRoleKey: string },
  ): Promise<void> {
    const deleteUserUrl = `${adminConfig.projectUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
    let response: Response;

    try {
      response = await fetch(deleteUserUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminConfig.serviceRoleKey}`,
          apikey: adminConfig.serviceRoleKey,
        },
      });
    } catch {
      throw new BadGatewayException({
        code: 'SUPABASE_USER_DELETE_FAILED',
        message: 'Could not delete user in Supabase',
        details: {
          reason: 'network_error',
        },
      });
    }

    if (response.ok || response.status === 404) {
      return;
    }

    throw new BadGatewayException({
      code: 'SUPABASE_USER_DELETE_FAILED',
      message: 'Could not delete user in Supabase',
      details: {
        status: response.status,
        body: await this.safeReadResponseBody(response),
      },
    });
  }

  private async markDeletedUserAccess(userId: string, exp: unknown): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(buildDeletedUserAuthKey(userId), '1', 'EX', resolveDeletedUserAuthTtlSeconds(exp));
    } catch (error) {
      this.logger.warn(
        `Could not store deleted-user auth tombstone for ${userId}: ${this.stringifyError(error)}`,
      );
    }
  }

  private async clearPresenceMembership(userId: string): Promise<void> {
    const presenceRedisKey =
      this.config.get<string>('PRESENCE_REDIS_KEY')?.trim() || 'presence:online';

    try {
      await this.redisService.getClient().zrem(presenceRedisKey, `user:${userId}`);
    } catch (error) {
      this.logger.warn(
        `Could not remove presence membership for ${userId}: ${this.stringifyError(error)}`,
      );
    }
  }

  private async safeReadResponseBody(response: Response): Promise<unknown> {
    const bodyText = await response.text();
    if (!bodyText) {
      return null;
    }

    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      return bodyText;
    }
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

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
