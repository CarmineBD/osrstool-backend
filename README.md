# OSRS Tool Backend

[![CI](https://github.com/CarmineBD/osrstool-backend/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CarmineBD/osrstool-backend/actions/workflows/ci.yml)

Backend API for the OSRS Tool project. Built with NestJS and TypeScript, using PostgreSQL and Redis for persistence and caching.

## Requirements

- Node.js 18+ (LTS recommended)
- npm
- PostgreSQL 15+ (or use Docker)
- Redis (required; RedisJSON is used via JSON.GET/JSON.SET)

## Quick start

```bash
# install dependencies
npm install

# start backend + db + redis (Docker)
docker compose up --build

# run in watch mode
npm run start:dev
```

The API will start on `http://localhost:3000` by default.

## Environment variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Available variables:

- `NODE_ENV`: `development` or `production`.
- `PORT`: HTTP port for the API.
- `DATABASE_URL`: Full Postgres connection string (optional if you use the `DB_*` settings).
- `REDIS_URL`: Redis connection string (required).
- `DB_HOST`: Database host.
- `DB_PORT`: Database port.
- `DB_USER`: Database user.
- `DB_PASS`: Database password.
- `DB_NAME`: Database name.
- `HEALTH_CHECK_TIMEOUT_MS`: Timeout (ms) for dependency checks in `/health`.
- `RATE_LIMIT_TTL_SECONDS`: Rate limit window in seconds (default `60`).
- `RATE_LIMIT_LIMIT`: Max requests per window (default `60`).
- `CORS_ORIGINS`: Comma-separated allowed origins (e.g. `https://example.com,https://app.example.com`).
- `SWAGGER_ENABLED`: Set to `true` to enable Swagger in production (disabled by default in prod).
- `CDN_BASE`: Base URL for item icons (defaults to OSRS Wiki).
- `APP_VERSION`: Version label for `/version` (defaults to `package.json`).
- `GIT_COMMIT`: Commit hash for `/version`.
- `BUILD_DATE`: Build date for `/version` (ISO 8601 recommended).
- `SUPABASE_PROJECT_URL`: Supabase project URL (e.g. `https://xyzcompany.supabase.co`) used to resolve JWKS and validate issuer.
- `SUPABASE_JWT_AUD`: Expected JWT audience (optional, defaults to not enforced if empty; common value: `authenticated`).

## System endpoints

- `GET /health`: Returns service status, uptime, and DB/Redis checks. Responds `503` if a dependency fails.
- `GET /version`: Returns deploy version/commit metadata.

## Commands

```bash
# development
npm run start:dev

# build
npm run build

# run production build
npm run start:prod

# lint (auto-fix)
npm run lint

# format
npm run format

# tests
npm run test
npm run test:e2e
npm run test:cov
```

## Notes

- If you use Docker, default DB/Redis settings are defined in `docker-compose.yml` and no `.env` is required.
- Keep `.env` out of version control.

## Supabase Auth test endpoint

- `GET /me` is protected and expects `Authorization: Bearer <access_token>`.
- Only `/me` is protected; existing endpoints are unchanged.
- Token validation is done with Supabase JWKS: `${SUPABASE_PROJECT_URL}/auth/v1/.well-known/jwks.json`.
- Issuer is validated as `${SUPABASE_PROJECT_URL}/auth/v1`.
- In frontend, get the token with Supabase Auth:

```ts
const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;
```

- Call backend:

```bash
curl -H "Authorization: Bearer <access_token>" http://localhost:3000/me
```
  
## Production tips

- Set `NODE_ENV=production` to disable Swagger by default.
- Set `CORS_ORIGINS` explicitly in production.
- Use `DATABASE_URL` or the `DB_*` fields (either works).
- Configure `RATE_LIMIT_*` for public deployments.
