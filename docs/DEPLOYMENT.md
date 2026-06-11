# Pulse — Railway Deployment Guide

Three deployables + two managed dependencies. Deploy on day 0; never fight
deployment on the last day.

| Component | Platform | Notes |
|---|---|---|
| `apps/web` | Vercel | Next.js, zero-config |
| `apps/crm-api` | Railway | Node service + worker in one process |
| `apps/channel-simulator` | Railway | Tiny Node service |
| Postgres | Neon | `sslmode=require` |
| Redis | Upstash | `rediss://` (TLS) |

## Links

- Neon console: https://console.neon.tech
- Upstash console: https://console.upstash.com
- Railway dashboard: https://railway.com/dashboard
- Vercel dashboard: https://vercel.com/dashboard

## 0. Generate production secrets

Generate fresh production-only values. Do not reuse local dev secrets and do not
commit them.

```bash
node scripts/generate-secrets.mjs
```

If `.env` already exists locally, the script intentionally refuses to overwrite
it. In that case, ask Codex to generate a one-off production secret set, then
paste those values into Railway/Vercel environment variable UIs.

Required secrets:

- `PULSE_API_KEY`
- `WEBHOOK_HMAC_SECRET`
- `PII_ENCRYPTION_KEY`
- `PII_HASH_KEY`
- `SIMULATOR_ADMIN_KEY`

## 1. Create Neon Postgres

1. Go to https://console.neon.tech.
2. Create a project named `pulse-prod`.
3. Open the project and click **Connect**.
4. Copy the Postgres connection string.
5. Ensure the URL includes `sslmode=require`.

Use this as `DATABASE_URL`.

## 2. Create Upstash Redis

1. Go to https://console.upstash.com.
2. Create a Redis database named `pulse-redis-prod`.
3. Open the database's **Connect** panel.
4. Copy the Redis URL for TCP/Redis clients, not the REST URL.
5. Ensure it starts with `rediss://`.

Use this as `REDIS_URL`.

## 3. Create Railway project

1. Go to https://railway.com/dashboard.
2. Click **New Project**.
3. Choose **Empty Project**.
4. Name it `pulse-prod`.
5. Connect your GitHub account/repository if Railway asks.

For both Railway services below, keep **Root Directory** as the repo root (`/`).
Do not set it to `apps/crm-api` or `apps/channel-simulator`, because npm
workspaces need the root `package.json`.

## 4. Railway service: CRM API

Create a new service from the GitHub repo.

- **Service name:** `pulse-crm-api`
- **Root directory:** `/`
- **Build command:**

```bash
npm ci && npm run build -w @pulse/shared && npm run db:generate -w @pulse/crm-api && npm run build -w @pulse/crm-api
```

- **Pre-deploy command:**

```bash
npm run db:deploy -w @pulse/crm-api
```

- **Start command:**

```bash
node apps/crm-api/dist/main.js
```

- **Health check path:** `/healthz`

Add these variables:

```bash
NODE_ENV=production
DATABASE_URL=<neon-postgres-url>
REDIS_URL=<upstash-rediss-url>
PULSE_API_KEY=<prod-secret>
WEBHOOK_HMAC_SECRET=<prod-secret>
PII_ENCRYPTION_KEY=<prod-secret>
PII_HASH_KEY=<prod-secret>
SIMULATOR_URL=https://<simulator-railway-domain>
CRM_PUBLIC_URL=https://<crm-api-railway-domain>
WEB_ORIGIN=https://<vercel-web-domain>
```

After deploy, open **Settings → Networking → Public Networking** and click
**Generate Domain**. Save this as the CRM API public URL.

## 5. Railway service: Channel Simulator

Create a second service from the same GitHub repo.

- **Service name:** `pulse-channel-simulator`
- **Root directory:** `/`
- **Build command:**

```bash
npm ci && npm run build -w @pulse/shared && npm run build -w @pulse/channel-simulator
```

- **Start command:**

```bash
node apps/channel-simulator/dist/index.js
```

- **Health check path:** `/healthz`

Add these variables:

```bash
NODE_ENV=production
WEBHOOK_HMAC_SECRET=<same-value-as-crm-api>
SIMULATOR_ADMIN_KEY=<prod-secret>
CALLBACK_ALLOWLIST=https://<crm-api-railway-domain>
```

After deploy, open **Settings → Networking → Public Networking** and click
**Generate Domain**. Save this as the simulator public URL.

## 6. Update cross-service URLs

Once both Railway domains exist:

1. In `pulse-crm-api`, set:

```bash
CRM_PUBLIC_URL=https://<crm-api-railway-domain>
SIMULATOR_URL=https://<simulator-railway-domain>
```

2. In `pulse-channel-simulator`, set:

```bash
CALLBACK_ALLOWLIST=https://<crm-api-railway-domain>
```

3. Redeploy both Railway services.

Health checks:

```bash
curl https://<crm-api-railway-domain>/healthz
curl https://<simulator-railway-domain>/healthz
```

## 7. Web on Vercel

Create/import the Vercel project from the same GitHub repo.

- **Root directory:** `apps/web`
- **Framework preset:** Next.js
- **Include files outside root:** enabled

Add these variables:

```bash
CRM_API_URL=https://<crm-api-railway-domain>
PULSE_API_KEY=<same-value-as-crm-api>
SIMULATOR_URL=https://<simulator-railway-domain>
NEXT_PUBLIC_CRM_API_URL=https://<crm-api-railway-domain>
```

After Vercel gives you a public URL, update Railway `pulse-crm-api`:

```bash
WEB_ORIGIN=https://<vercel-web-domain>
```

Redeploy `pulse-crm-api`.

## 8. Seed the demo workspace

Run this locally with the production Neon URL and production PII keys:

```bash
DATABASE_URL=<neon-url> PII_ENCRYPTION_KEY=... PII_HASH_KEY=... \
  npm run seed -w @pulse/crm-api
```

## 9. Smoke-check the loop

```bash
CRM_PUBLIC_URL=https://<crm> SIMULATOR_URL=https://<sim> \
PULSE_API_KEY=... SIMULATOR_ADMIN_KEY=... \
  npm run test:integration
```

## Local development

```bash
docker compose up -d
npm run secrets
npm ci
npm run db:migrate
npm run seed
npm run dev:sim & npm run dev:crm & npm run dev:web
```
