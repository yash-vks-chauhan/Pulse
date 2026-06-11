/**
 * Seeds a realistic demo workspace for "Daily Ritual Coffee Co." — a fictional
 * D2C coffee brand:
 *   ~5,000 customers (PII encrypted at rest, like every other write path)
 *   ~25,000 orders with a skewed spend distribution and believable recency
 *   1 completed past campaign with a realistic funnel, so reviewers land on a
 *     living product rather than an empty state
 *
 * Deterministic (seeded faker) and guarded: refuses to run on a non-empty
 * database unless FORCE_SEED=1.
 *
 * Run: npm run seed   (root)   |   npm run seed -w @pulse/crm-api
 */
import { faker } from '@faker-js/faker';
import { PrismaClient, type CommunicationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { STATUS_RANK } from '@pulse/shared';
import { PiiCrypto } from '../src/common/pii-crypto';
import { config } from '../src/config';

const prisma = new PrismaClient();
const pii = new PiiCrypto(config.piiEncryptionKey, config.piiHashKey);

faker.seed(20260611);

const CUSTOMER_COUNT = 5000;
const TARGET_ORDER_COUNT = 25_000;
const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const CITIES = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Gurugram',
];

const TAG_POOL = ['subscriber', 'gifter', 'wholesale', 'espresso-lover', 'cold-brew', 'referral'];

const CATALOG = [
  { sku: 'DR-AR-250', name: 'Attikan Estate Arabica 250g', price: 449 },
  { sku: 'DR-AR-500', name: 'Attikan Estate Arabica 500g', price: 799 },
  { sku: 'DR-BL-250', name: 'Monsoon Malabar Blend 250g', price: 499 },
  { sku: 'DR-SD-250', name: 'Single Origin Chikmagalur 250g', price: 599 },
  { sku: 'DR-CB-6PK', name: 'Cold Brew Cans 6-pack', price: 540 },
  { sku: 'DR-EQ-V60', name: 'Pour-Over V60 Starter Kit', price: 1299 },
  { sku: 'DR-EQ-FRE', name: 'French Press 600ml', price: 999 },
  { sku: 'DR-GF-BOX', name: 'Gift Box: Brew Ritual', price: 1499 },
];

/** Heavy-tailed order count (mean ≈ 5): most buy 1-3 times, a few are whales. */
function drawOrderCount(): number {
  const roll = Math.random();
  if (roll < 0.22) return 1;
  if (roll < 0.44) return 2;
  if (roll < 0.64) return 3;
  if (roll < 0.8) return faker.number.int({ min: 4, max: 6 });
  if (roll < 0.93) return faker.number.int({ min: 7, max: 12 });
  return faker.number.int({ min: 13, max: 30 });
}

/** Recency skew: actives cluster in the last 90 days, a churned tail does not. */
function drawOrderedAt(isChurned: boolean): Date {
  const daysAgo = isChurned
    ? faker.number.int({ min: 60, max: 540 })
    : faker.number.float({ min: 0, max: 1 }) ** 2 * 180;
  return new Date(NOW - daysAgo * DAY_MS - faker.number.int({ min: 0, max: DAY_MS }));
}

async function main(): Promise<void> {
  const existing = await prisma.customer.count();
  if (existing > 0 && process.env['FORCE_SEED'] !== '1') {
    console.error(`Database already has ${existing} customers. Set FORCE_SEED=1 to re-seed anyway.`);
    process.exit(1);
  }

  console.log('Seeding Daily Ritual Coffee Co. demo workspace…');

  // ── Customers + orders ─────────────────────────────────────────────────────
  type CustomerRow = {
    id: string;
    externalId: string;
    name: string;
    emailEnc: string | null;
    emailHash: string | null;
    phoneEnc: string | null;
    city: string;
    tags: string[];
    totalSpend: number;
    orderCount: number;
    lastOrderAt: Date | null;
    createdAt: Date;
  };
  type OrderRow = {
    id: string;
    externalId: string;
    customerId: string;
    amount: number;
    items: object[];
    orderedAt: Date;
    source: string;
  };

  const customers: CustomerRow[] = [];
  const orders: OrderRow[] = [];

  for (let i = 0; i < CUSTOMER_COUNT && orders.length < TARGET_ORDER_COUNT + 2000; i++) {
    const id = randomUUID();
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = `${firstName} ${lastName}`;
    const email = faker.internet
      .email({ firstName, lastName, provider: 'example.com' })
      .toLowerCase();
    const phone = `+91 ${faker.string.numeric(5)} ${faker.string.numeric(5)}`;
    const isChurned = Math.random() < 0.35;
    const orderCount = drawOrderCount();

    let totalSpend = 0;
    let lastOrderAt: Date | null = null;
    for (let j = 0; j < orderCount; j++) {
      const lineCount = faker.number.int({ min: 1, max: 3 });
      const items = Array.from({ length: lineCount }, () => {
        const product = faker.helpers.arrayElement(CATALOG);
        const qty = faker.number.int({ min: 1, max: 3 });
        return { ...product, qty };
      });
      const amount = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const orderedAt = drawOrderedAt(isChurned);
      totalSpend += amount;
      if (!lastOrderAt || orderedAt > lastOrderAt) lastOrderAt = orderedAt;
      orders.push({
        id: randomUUID(),
        externalId: `seed-ord-${i}-${j}`,
        customerId: id,
        amount,
        items,
        orderedAt,
        source: 'seed',
      });
    }

    customers.push({
      id,
      externalId: `seed-cust-${i}`,
      name,
      emailEnc: pii.encrypt(email),
      emailHash: pii.blindIndex(email),
      phoneEnc: Math.random() < 0.95 ? pii.encrypt(phone) : null,
      city: faker.helpers.arrayElement(CITIES),
      tags: faker.helpers.arrayElements(TAG_POOL, { min: 0, max: 3 }),
      totalSpend,
      orderCount,
      lastOrderAt,
      createdAt: new Date(NOW - faker.number.int({ min: 1, max: 600 }) * DAY_MS),
    });
  }

  for (let i = 0; i < customers.length; i += 1000) {
    await prisma.customer.createMany({ data: customers.slice(i, i + 1000) });
  }
  console.log(`  customers: ${customers.length}`);

  for (let i = 0; i < orders.length; i += 1000) {
    await prisma.order.createMany({ data: orders.slice(i, i + 1000) });
  }
  console.log(`  orders: ${orders.length}`);

  // ── One completed past campaign with a realistic funnel ───────────────────
  const campaign = await prisma.campaign.create({
    data: {
      name: 'Monsoon Malabar Launch — WhatsApp',
      objective: 'Announce the Monsoon Malabar blend to engaged buyers',
      messageTemplate:
        'Hi {{name}}! Our new Monsoon Malabar blend just landed — earthy, bold, very you. Free shipping this week ☕',
      channelPolicy: { primary: 'whatsapp', failover: ['sms'], failoverWindowMinutes: 60 },
      audienceJson: { min_order_count: 2, limit: 800 },
      status: 'COMPLETED',
      audienceSnapshotCount: 800,
      createdAt: new Date(NOW - 9 * DAY_MS),
      launchedAt: new Date(NOW - 9 * DAY_MS + 3600_000),
    },
  });

  const audience = customers.filter((c) => c.orderCount >= 2 && c.phoneEnc).slice(0, 800);
  const launchTime = NOW - 9 * DAY_MS + 3600_000;

  type CommRow = {
    id: string;
    campaignId: string;
    customerId: string;
    channel: 'whatsapp';
    messageRendered: string;
    status: CommunicationStatus;
    statusRank: number;
    attempt: number;
    sentAt: Date;
    lastEventAt: Date | null;
    createdAt: Date;
  };
  type EventRow = {
    communicationId: string;
    eventType: string;
    eventTs: Date;
    idempotencyKey: string;
    payload: object;
    receivedAt: Date;
  };

  const comms: CommRow[] = [];
  const events: EventRow[] = [];

  for (const customer of audience) {
    const commId = randomUUID();
    const roll = Math.random();
    // Funnel: 7% failed, then delivered → 60% read → 22% clicked.
    let status: CommunicationStatus;
    if (roll < 0.07) status = 'FAILED';
    else if (roll < 0.07 + 0.93 * 0.4) status = 'DELIVERED';
    else if (roll < 0.07 + 0.93 * (0.4 + 0.6 * 0.78)) status = 'READ';
    else status = 'CLICKED';

    const sentAt = new Date(launchTime + faker.number.int({ min: 0, max: 1800_000 }));
    const lifecycle: Array<{ type: string; at: Date }> = [];
    let cursor = sentAt.getTime() + faker.number.int({ min: 500, max: 5000 });
    if (status === 'FAILED') {
      lifecycle.push({ type: 'failed', at: new Date(cursor) });
    } else {
      lifecycle.push({ type: 'delivered', at: new Date(cursor) });
      if (status === 'READ' || status === 'CLICKED') {
        cursor += faker.number.int({ min: 60_000, max: 36_000_000 });
        lifecycle.push({ type: 'read', at: new Date(cursor) });
      }
      if (status === 'CLICKED') {
        cursor += faker.number.int({ min: 30_000, max: 3_600_000 });
        lifecycle.push({ type: 'clicked', at: new Date(cursor) });
      }
    }

    comms.push({
      id: commId,
      campaignId: campaign.id,
      customerId: customer.id,
      channel: 'whatsapp',
      messageRendered: campaign.messageTemplate.replaceAll('{{name}}', customer.name),
      status,
      statusRank: STATUS_RANK[status],
      attempt: 1,
      sentAt,
      lastEventAt: lifecycle[lifecycle.length - 1]?.at ?? null,
      createdAt: new Date(launchTime),
    });

    for (const step of lifecycle) {
      events.push({
        communicationId: commId,
        eventType: step.type,
        eventTs: step.at,
        idempotencyKey: `${commId}:${step.type}`,
        payload: { event_id: randomUUID(), channel: 'whatsapp', seeded: true },
        receivedAt: step.at,
      });
    }
  }

  for (let i = 0; i < comms.length; i += 1000) {
    await prisma.communication.createMany({ data: comms.slice(i, i + 1000) });
  }
  for (let i = 0; i < events.length; i += 1000) {
    await prisma.commEvent.createMany({ data: events.slice(i, i + 1000) });
  }
  console.log(`  past campaign: "${campaign.name}" (${comms.length} comms, ${events.length} events)`);

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
