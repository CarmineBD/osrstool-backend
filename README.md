# OSRS Tool Backend

Backend API for the OSRS Tool project. Built with NestJS and TypeScript, using PostgreSQL and Redis for persistence and caching.

## Requirements

- Node.js 18+ (LTS recommended)
- npm
- PostgreSQL 15+ (or use Docker)
- Redis (optional, if configured)

## Quick start

```bash
# install dependencies
npm install

# start database (optional, if you use Docker)
docker compose up -d

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

- `PORT`: HTTP port for the API.
- `DATABASE_URL`: Full Postgres connection string (optional if you use the `DB_*` settings).
- `REDIS_URL`: Redis connection string (optional).
- `DB_HOST`: Database host.
- `DB_PORT`: Database port.
- `DB_USER`: Database user.
- `DB_PASS`: Database password.
- `DB_NAME`: Database name.
- `HEALTH_CHECK_TIMEOUT_MS`: Timeout (ms) for dependency checks in `/health`.
- `APP_VERSION`: Version label for `/version` (defaults to `package.json`).
- `GIT_COMMIT`: Commit hash for `/version`.
- `BUILD_DATE`: Build date for `/version` (ISO 8601 recommended).

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

- If you use Docker, the default database credentials are defined in `docker-compose.yml`.
- Keep `.env` out of version control.
