# Pulse — Deployment Guide

Three deployables + two managed dependencies. Deploy on day 0; never fight
deployment on the last day.

| Component | Platform | Notes |
|---|---|---|
| `apps/web` | Vercel | Next.js, zero-config |
| `apps/crm-api` | Railway / Render | Node service + worker in one process |
| `apps/channel-simulator` | Railway / Render | Tiny Node service |
| Postgres | Neon | `sslmode=require` |
| Redis | Upstash | `rediss://` (TLS) |

## 0. Generate production secrets

```bash
node scripts/generate-secrets.mjs   # locally, then copy values into platform env UIs
```

Never reuse local dev secrets in production. See docs/SECURITY.md for what
each key protects.

## 1. CRM API (Railway/Render)

- **Root directory:** repo root (workspaces need the root package.json)
- **Build:** `npm ci && npm run build -w @pulse/shared && npm run db:generate -w @pulse/crm-api && npm run build -w @pulse/crm-api`
- **Pre-deploy (migrations):** `npm run db:deploy -w @pulse/crm-api`
- **Start:** `node apps/crm-api/dist/main.js`
- **Env:** `DATABASE_URL`, `REDIS_URL`, `PULSE_API_KEY`, `WEBHOOK_HMAC_SECRET`,
  `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`, `SIMULATOR_URL`, `CRM_PUBLIC_URL`
  (this service's own public URL), `WEB_ORIGIN`, `NODE_ENV=production`
- **Health check path:** `/healthz`

## 2. Channel Simulator (Railway/Render)

- **Build:** `npm ci && npm run build -w @pulse/shared && npm run build -w @pulse/channel-simulator`
- **Start:** `node apps/channel-simulator/dist/index.js`
- **Env:** `WEBHOOK_HMAC_SECRET` (same value as CRM), `SIMULATOR_ADMIN_KEY`,
  `CALLBACK_ALLOWLIST=https://<crm-public-url>`, `NODE_ENV=production`
- **Health check path:** `/healthz`

## 3. Web (Vercel)

- **Root directory:** `apps/web` (enable "include files outside root" for the
  workspace), framework preset Next.js
- **Env:** `CRM_API_URL=https://<crm-public-url>`, `PULSE_API_KEY` (server-side
  only — no `NEXT_PUBLIC_` prefix), `SIMULATOR_URL`,
  `NEXT_PUBLIC_CRM_API_URL=https://<crm-public-url>` (used only to render curl
  examples on the docs page)

## 4. Seed the demo workspace

```bash
DATABASE_URL=<neon-url> PII_ENCRYPTION_KEY=... PII_HASH_KEY=... \
  npm run seed -w @pulse/crm-api
```

## 5. Smoke-check the loop

```bash
CRM_PUBLIC_URL=https://<crm> SIMULATOR_URL=https://<sim> \
PULSE_API_KEY=... SIMULATOR_ADMIN_KEY=... \
  npm run test:integration
```

## Local development

```bash
docker compose up -d          # postgres + redis
npm run secrets               # one-time: writes .env with strong keys
npm ci
npm run db:migrate            # creates schema (dev migration)
npm run seed                  # 5k customers / 25k orders / 1 past campaign
npm run dev:sim & npm run dev:crm & npm run dev:web
```
