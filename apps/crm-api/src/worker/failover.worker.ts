import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { channelPolicySchema } from '../campaigns/campaigns.schemas';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchQueueService } from './dispatch-queue.service';
import { ESCALATION_RANK_RANGE, channelSequence } from './failover.logic';
import { FAILOVER_QUEUE, FailoverQueueService, type FailoverJobData } from './failover-queue.service';

const CONCURRENCY = 2;
const DISPATCH_BATCH_SIZE = 50;
const INSERT_CHUNK_SIZE = 1000;

/**
 * Failover sweep worker. One sweep per (campaign, hop), scheduled
 * failoverWindowMinutes after the hop's messages went out.
 *
 *  - Escalation creates a CHILD communication on the next channel, linked via
 *    parent_communication_id; the parent's history is never rewritten.
 *  - parent_communication_id is UNIQUE, and children are inserted with
 *    skipDuplicates — a crashed/retried sweep can never double-escalate.
 *  - Customers without a contact for the next channel are skipped (and remain
 *    eligible for the hop after, where they may be reachable again).
 *  - The sweep after the last hop finalizes the campaign: COMPLETED once
 *    nothing is left in flight.
 */
@Injectable()
export class FailoverWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FailoverWorker.name);
  private worker: Worker<FailoverJobData> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly failoverQueue: FailoverQueueService,
    private readonly dispatchQueue: DispatchQueueService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<FailoverJobData>(FAILOVER_QUEUE, (job) => this.process(job), {
      connection: this.failoverQueue.connection,
      concurrency: CONCURRENCY,
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`Failover sweep ${job?.id} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<FailoverJobData>): Promise<void> {
    const { campaignId, hop } = job.data;
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status === 'DRAFT') return;

    // Policy comes from our own DB but is still parsed before use.
    const policy = channelPolicySchema.safeParse(campaign.channelPolicy);
    if (!policy.success) {
      this.logger.error(`Campaign ${campaignId} has an invalid channel policy; skipping sweep`);
      return;
    }
    const sequence = channelSequence(policy.data);
    const currentChannel = sequence[hop];
    const nextChannel = sequence[hop + 1];

    if (!currentChannel || !nextChannel) {
      await this.finalize(campaignId);
      return;
    }

    // The next channel must be reachable: email needs an email, the rest a phone.
    const contactFilter: Prisma.CustomerWhereInput =
      nextChannel === 'email' ? { emailEnc: { not: null } } : { phoneEnc: { not: null } };

    const stalled = await this.prisma.communication.findMany({
      where: {
        campaignId,
        channel: currentChannel,
        statusRank: ESCALATION_RANK_RANGE,
        failoverChild: { is: null },
        customer: contactFilter,
      },
      select: { id: true, customerId: true, messageRendered: true },
    });

    if (stalled.length > 0) {
      const children = stalled.map((parent) => ({
        id: randomUUID(),
        campaignId,
        customerId: parent.customerId,
        channel: nextChannel,
        messageRendered: parent.messageRendered,
        parentCommunicationId: parent.id,
      }));

      for (let i = 0; i < children.length; i += INSERT_CHUNK_SIZE) {
        // skipDuplicates + UNIQUE(parent_communication_id): idempotent under
        // sweep retries and concurrent workers.
        await this.prisma.communication.createMany({
          data: children.slice(i, i + INSERT_CHUNK_SIZE),
          skipDuplicates: true,
        });
      }

      const ids = children.map((child) => child.id);
      for (let i = 0; i < ids.length; i += DISPATCH_BATCH_SIZE) {
        await this.dispatchQueue.enqueue({
          campaignId,
          communicationIds: ids.slice(i, i + DISPATCH_BATCH_SIZE),
        });
      }
      this.logger.log(
        `Campaign ${campaignId}: escalated ${stalled.length} communications ${currentChannel} → ${nextChannel}`,
      );
    }

    // Always schedule the next sweep — it either escalates the next hop or
    // finalizes the campaign one window after the last hop.
    await this.failoverQueue.scheduleSweep(
      { campaignId, hop: hop + 1 },
      policy.data.failoverWindowMinutes * 60_000,
    );
  }

  private async finalize(campaignId: string): Promise<void> {
    const inFlight = await this.prisma.communication.count({
      where: { campaignId, status: { in: ['QUEUED', 'SENT'] } },
    });
    if (inFlight === 0) {
      await this.prisma.campaign.updateMany({
        where: { id: campaignId, status: 'RUNNING' },
        data: { status: 'COMPLETED' },
      });
      this.logger.log(`Campaign ${campaignId} finalized: COMPLETED`);
    } else {
      this.logger.log(`Campaign ${campaignId} still has ${inFlight} communications in flight`);
    }
  }
}
