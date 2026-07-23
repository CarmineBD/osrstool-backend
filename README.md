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

Additional templates:

- `.env.local.example`: local backend with cron/jobs disabled by default.
- `.env.tst.example`: Railway TST backend.
- `.env.production.example`: Railway PRO backend.

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
- `SCHEDULED_JOBS_ENABLED`: Set to `false` to disable startup jobs and cron jobs in this instance while keeping the API available (default `true`). Keep this `false` in local if your local instance points to shared remote DB/Redis.
- `PRICE_CHANGE_WINDOW_SECONDS`: Price-change window in seconds for incremental refresh in `items:prices` (default `120`).
- `ITEM_VOLUMES_INIT_ENABLED`: Set to `false` to skip item-volumes init backfill on startup (default `true`).
- `VARIANT_HISTORY_PRUNE_ENABLED`: Enables hourly pruning of raw and 15m history according to the retention variables.
- `VARIANT_HISTORY_RAW_RETENTION_HOURS`: Retention for `variant_history` raw points (default `72`).
- `VARIANT_HISTORY_15M_RETENTION_DAYS`: Retention for `variant_history_15m` rollups (default `90`).
- `CORS_ORIGINS`: Comma-separated allowed origins (e.g. `https://example.com,https://app.example.com`).
- `SWAGGER_ENABLED`: Set to `true` to enable Swagger in production (disabled by default in prod).
- `CDN_BASE`: Base URL for item icons (defaults to OSRS Wiki).
- `OSRS_WIKI_USER_AGENT`: User-Agent descriptivo para llamadas automatizadas a la API pública de OSRS Wiki (recomendado para scripts de sync).
- `APP_VERSION`: Version label for `/version` (defaults to `package.json`).
- `GIT_COMMIT`: Commit hash for `/version`.
- `BUILD_DATE`: Build date for `/version` (ISO 8601 recommended).
- `SUPABASE_PROJECT_URL`: Supabase project URL (e.g. `https://xyzcompany.supabase.co`) used to resolve JWKS and validate issuer.
- `SUPABASE_JWT_AUD`: Expected JWT audience (optional, defaults to not enforced if empty; common value: `authenticated`).

## Environment recipes

### Local backend

Use `.env.local.example` when you run the backend locally.

Recommended local defaults:

```env
NODE_ENV=development
SCHEDULED_JOBS_ENABLED=false
ITEM_VOLUMES_INIT_ENABLED=false
VARIANT_HISTORY_PRUNE_ENABLED=false
CORS_ORIGINS=http://localhost:5173
```

This prevents duplicate writes when local points to the same remote Postgres/Redis used by Railway.

### Railway TST backend

Use `.env.tst.example` as the base for the TST service.

Recommended TST values:

```env
NODE_ENV=production
SCHEDULED_JOBS_ENABLED=true
ITEM_VOLUMES_INIT_ENABLED=true
VARIANT_HISTORY_PRUNE_ENABLED=false
CORS_ORIGINS=https://osrstool-frontend-tst.vercel.app
```

### Railway PRO backend

Use `.env.production.example` as the base for the PRO service.

Recommended PRO values:

```env
NODE_ENV=production
SCHEDULED_JOBS_ENABLED=true
ITEM_VOLUMES_INIT_ENABLED=true
VARIANT_HISTORY_PRUNE_ENABLED=true
CORS_ORIGINS=https://osrstool-frontend-eight.vercel.app
```

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

# force item-volumes backfill (optional: pass a reference unix ts aligned to hour)
ITEM_VOLUMES_INIT_ENABLED=false npm run item-volumes:backfill -- 1735689600

# sync de tabla items desde /mapping (sin escribir en DB)
npm run sync:items:mapping:dry

# sync real (inserta/actualiza por diff)
npm run sync:items:mapping

# opcional: tamaño de lote para persistencia
npm run sync:items:mapping -- --chunkSize=1000
```

## Notes

- If you use Docker, default DB/Redis settings are defined in `docker-compose.yml` and no `.env` is required.
- Keep `.env` out of version control.
- La API pública de precios de OSRS Wiki solicita usar un `User-Agent` descriptivo en automatizaciones; configura `OSRS_WIKI_USER_AGENT` para este proyecto.

## Supabase Auth test endpoint

- `GET /me` is protected and expects `Authorization: Bearer <access_token>`.
- Only `/me` is protected; existing endpoints are unchanged.
- Token validation is done with Supabase JWKS: `${SUPABASE_PROJECT_URL}/auth/v1/.well-known/jwks.json`.
- Issuer is validated as `${SUPABASE_PROJECT_URL}/auth/v1`.
- `GET /me` auto-upserts the authenticated user in `public.users`:
  - Creates user if missing with `plan='free'` and `role='user'`.
  - Returns `{ data: { id, email, plan, role } }`.
  - If user exists and email changed, updates email and `updated_at`.

## SQL setup for `public.users`

This repository does not include TypeORM migrations yet, so create the table manually in Railway/Postgres:

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Optional trigger to auto-update `updated_at` on DB-side updates:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```
- In frontend, get the token with Supabase Auth:

```ts
const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;
const me = await fetch('http://localhost:3000/me', {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
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
