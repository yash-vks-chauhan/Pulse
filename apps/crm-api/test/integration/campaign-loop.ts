/**
 * Phase 1 integration test — the spine, end to end:
 *
 *   1. Crank the simulator's chaos dials UP (failures, duplicates, out-of-order)
 *   2. Ingest 1,000 fresh customers through the public API
 *   3. Create + launch a 1,000-message WhatsApp campaign
 *   4. Watch states converge through the queue → simulator → receipts loop
 *   5. Assert convergence invariants, then restore chaos defaults
 *
 * Requires running services (docker compose up -d; npm run dev:crm; npm run dev:sim).
 * Run: npm run test:integration
 */
import { randomUUID } from 'node:crypto';
import { config } from '../../src/config';

const CRM = config.crmPublicUrl;
const SIM = config.simulatorUrl;
const ADMIN_KEY = process.env['SIMULATOR_ADMIN_KEY'] ?? '';
const AUDIENCE = 1000;
const RUN_ID = randomUUID().slice(0, 8);
const RUN_CITY = `IT-${RUN_ID}`;

const log = (msg: string) => console.log(`[integration] ${msg}`);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CRM}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function setChaos(body: object): Promise<void> {
  if (!ADMIN_KEY) {
    log('SIMULATOR_ADMIN_KEY not set — skipping chaos dial changes');
    return;
  }
  const response = await fetch(`${SIM}/admin/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`simulator config update failed: ${response.status}`);
}

interface Stats {
  total: number;
  status_counts: Record<string, number>;
  funnel: Record<string, number>;
  event_counts: Record<string, number>;
}

async function main(): Promise<void> {
  // 0. Health
  const health = (await fetch(`${CRM}/healthz`).then((r) => r.json())) as {
    status: string;
  };
  if (health.status !== 'ok') throw new Error(`crm-api unhealthy: ${JSON.stringify(health)}`);
  const simHealth = (await fetch(`${SIM}/healthz`).then((r) => r.json())) as { status: string };
  if (simHealth.status !== 'ok') throw new Error('simulator unhealthy');
  log('services healthy');

  // 1. Chaos dials UP
  await setChaos({
    chaos: { duplicateRate: 0.3, outOfOrderRate: 0.3 },
    channels: { whatsapp: { failureRate: 0.15, ratePerSec: 40, burst: 80 } },
  });
  log('chaos dials up: 30% duplicates, 30% out-of-order, 15% whatsapp failures');

  // 2. Ingest 1,000 customers tagged with a run-unique city
  for (let batch = 0; batch < 2; batch++) {
    const customers = Array.from({ length: 500 }, (_, i) => {
      const n = batch * 500 + i;
      return {
        external_id: `it-${RUN_ID}-${n}`,
        name: `Test Shopper ${n}`,
        email: `shopper${n}.${RUN_ID}@example.com`,
        phone: `+91 90000 ${String(10000 + n).slice(-5)}`,
        city: RUN_CITY,
        tags: ['integration'],
      };
    });
    const result = await api<{ upserted: number }>('/api/ingest/customers', {
      method: 'POST',
      body: JSON.stringify({ customers }),
    });
    if (result.upserted !== 500) throw new Error(`expected 500 upserts, got ${result.upserted}`);
  }
  log(`ingested ${AUDIENCE} customers (city=${RUN_CITY})`);

  // 3. Create + launch
  const campaign = await api<{ id: string }>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: `Integration run ${RUN_ID}`,
      objective: 'Receipt-loop integration test',
      message_template: 'Hi {{name}}, this is a chaos-mode integration test ☕',
      channel_policy: { primary: 'whatsapp', failover: [], failoverWindowMinutes: 60 },
      audience: { city: RUN_CITY, limit: AUDIENCE },
    }),
  });
  const launch = await api<{ audience_snapshot_count: number }>(
    `/api/campaigns/${campaign.id}/launch`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  if (launch.audience_snapshot_count !== AUDIENCE) {
    throw new Error(`expected snapshot of ${AUDIENCE}, got ${launch.audience_snapshot_count}`);
  }
  log(`launched campaign ${campaign.id} to ${AUDIENCE} customers`);

  // 4. Poll until converged: nothing queued/sent-pending, all terminal-ish
  const deadline = Date.now() + 240_000;
  let stats: Stats | undefined;
  let settledSince: number | undefined;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    stats = await api<Stats>(`/api/campaigns/${campaign.id}/stats`);
    const counts = stats.status_counts;
    const queued = counts['QUEUED'] ?? 0;
    const sentOnly = counts['SENT'] ?? 0;
    process.stdout.write(
      `\r[integration] queued=${queued} sent=${sentOnly} delivered=${stats.funnel['delivered']} ` +
        `failed=${counts['FAILED']} clicked=${stats.funnel['clicked']}   `,
    );
    // Converged when nothing is queued and in-flight SENT count has drained
    // below 2% (late out-of-order events may still trickle in).
    if (queued === 0 && sentOnly <= AUDIENCE * 0.02) {
      if (settledSince === undefined) settledSince = Date.now();
      if (Date.now() - settledSince > 10_000) break; // stable for 10s
    } else {
      settledSince = undefined;
    }
  }
  console.log('');
  if (!stats) throw new Error('no stats collected');

  // 5. Invariants
  const counts = stats.status_counts;
  const total = stats.total;
  const queued = counts['QUEUED'] ?? 0;
  const delivered = stats.funnel['delivered'] ?? 0;
  const failed = counts['FAILED'] ?? 0;
  const deliveredEvents = stats.event_counts['delivered'] ?? 0;

  const failures: string[] = [];
  if (total !== AUDIENCE) failures.push(`total communications ${total} != ${AUDIENCE}`);
  if (queued !== 0) failures.push(`${queued} communications still QUEUED`);
  if (delivered + failed < AUDIENCE * 0.95) {
    failures.push(`only ${delivered + failed}/${AUDIENCE} reached a settled state`);
  }
  if (delivered < AUDIENCE * 0.5) failures.push(`delivered ${delivered} suspiciously low`);
  if (deliveredEvents > delivered) {
    failures.push(
      `event log has ${deliveredEvents} delivered events but only ${delivered} delivered comms — duplicates leaked into state`,
    );
  }

  // 6. Restore chaos defaults
  await setChaos({
    chaos: { duplicateRate: 0.05, outOfOrderRate: 0.1 },
    channels: { whatsapp: { failureRate: 0.06, ratePerSec: 25, burst: 50 } },
  });

  log(`funnel: ${JSON.stringify(stats.funnel)}`);
  log(`events: ${JSON.stringify(stats.event_counts)}`);
  if (failures.length > 0) {
    console.error('[integration] FAILED:');
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  log('PASSED — receipt loop converged correctly under chaos ✅');
}

main().catch((error) => {
  console.error('\n[integration] ERROR:', error.message ?? error);
  process.exit(1);
});
