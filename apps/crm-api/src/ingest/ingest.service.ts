import { Injectable, Logger } from '@nestjs/common';
import { PiiCrypto } from '../common/pii-crypto';
import { config } from '../config';
import { InsightsService } from '../insights/insights.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomersBatch, OrdersBatch } from './ingest.schemas';

export interface IngestResult {
  upserted: number;
  errors: Array<{ external_id: string; reason: string }>;
}

/**
 * Synchronous, idempotent upserts keyed by external_id.
 * Stated tradeoff: at Xeno scale ingestion goes through a queue (pub/sub) so
 * the API only validates and acks; at this scope writes are synchronous.
 *
 * PII (email/phone) is AES-256-GCM-encrypted before it touches the database;
 * the email blind index supports lookups without decryption.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly pii = new PiiCrypto(config.piiEncryptionKey, config.piiHashKey);

  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsService,
  ) {}

  async upsertCustomers(batch: CustomersBatch): Promise<IngestResult> {
    const errors: IngestResult['errors'] = [];
    let upserted = 0;

    for (const chunk of chunked(batch.customers, 100)) {
      await this.prisma.$transaction(
        chunk.map((customer) => {
          const data = {
            name: customer.name,
            emailEnc: customer.email ? this.pii.encrypt(customer.email) : null,
            emailHash: customer.email ? this.pii.blindIndex(customer.email) : null,
            phoneEnc: customer.phone ? this.pii.encrypt(customer.phone) : null,
            city: customer.city ?? null,
            tags: customer.tags ?? [],
          };
          return this.prisma.customer.upsert({
            where: { externalId: customer.external_id },
            create: { externalId: customer.external_id, ...data },
            update: data,
          });
        }),
      );
      upserted += chunk.length;
    }

    this.logger.log(`Upserted ${upserted} customers`);
    return { upserted, errors };
  }

  async upsertOrders(batch: OrdersBatch): Promise<IngestResult> {
    const errors: IngestResult['errors'] = [];

    const customerExternalIds = [...new Set(batch.orders.map((o) => o.customer_external_id))];
    const customers = await this.prisma.customer.findMany({
      where: { externalId: { in: customerExternalIds } },
      select: { id: true, externalId: true },
    });
    const customerIdByExternal = new Map(customers.map((c) => [c.externalId, c.id]));

    const valid = batch.orders.filter((order) => {
      if (!customerIdByExternal.has(order.customer_external_id)) {
        errors.push({
          external_id: order.external_id,
          reason: `unknown customer_external_id: ${order.customer_external_id}`,
        });
        return false;
      }
      return true;
    });

    let upserted = 0;
    const upsertedRows: Array<{ id: string; customerId: string; orderedAt: Date }> = [];
    for (const chunk of chunked(valid, 100)) {
      const rows = await this.prisma.$transaction(
        chunk.map((order) => {
          const data = {
            customerId: customerIdByExternal.get(order.customer_external_id)!,
            amount: order.amount,
            items: order.items ?? [],
            orderedAt: new Date(order.ordered_at),
            source: order.source ?? 'api',
          };
          return this.prisma.order.upsert({
            where: { externalId: order.external_id },
            create: { externalId: order.external_id, ...data },
            update: data,
          });
        }),
      );
      upserted += chunk.length;
      upsertedRows.push(...rows.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        orderedAt: row.orderedAt,
      })));
    }

    // Recompute denormalized rollups from the orders table itself — re-running
    // the same ingest can never double-count.
    const affectedCustomerIds = valid.map((o) => customerIdByExternal.get(o.customer_external_id)!);
    await this.recomputeRollups([...new Set(affectedCustomerIds)]);

    // Attribution: orders following a click/read inside the 72h window mark
    // their communication CONVERTED. Idempotent, so re-ingestion is safe.
    const attributed = await this.insights.attributeNewOrders(upsertedRows);

    this.logger.log(`Upserted ${upserted} orders (${errors.length} rejected, ${attributed} attributed)`);
    return { upserted, errors };
  }

  private async recomputeRollups(customerIds: string[]): Promise<void> {
    if (customerIds.length === 0) return;
    const rollups = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds } },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { orderedAt: true },
    });
    await this.prisma.$transaction(
      rollups.map((rollup) =>
        this.prisma.customer.update({
          where: { id: rollup.customerId },
          data: {
            totalSpend: rollup._sum.amount ?? 0,
            orderCount: rollup._count._all,
            lastOrderAt: rollup._max.orderedAt,
          },
        }),
      ),
    );
  }
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
