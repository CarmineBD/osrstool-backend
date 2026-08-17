const DELETED_USER_AUTH_KEY_PREFIX = 'auth:deleted-user:';
const FALLBACK_DELETED_USER_TTL_SECONDS = 3600;

export function buildDeletedUserAuthKey(userId: string): string {
  return `${DELETED_USER_AUTH_KEY_PREFIX}${userId}`;
}

export function resolveDeletedUserAuthTtlSeconds(exp: unknown, referenceDate = new Date()): number {
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return FALLBACK_DELETED_USER_TTL_SECONDS;
  }

  const remainingSeconds = Math.ceil(exp - referenceDate.getTime() / 1000);
  return Math.max(remainingSeconds, FALLBACK_DELETED_USER_TTL_SECONDS);
}
