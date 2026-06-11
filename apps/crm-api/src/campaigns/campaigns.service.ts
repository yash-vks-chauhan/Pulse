import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { COMMUNICATION_STATUSES, STATUS_RANK, segmentDslSchema } from '@pulse/shared';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { compileSegmentDsl } from '../segments/dsl.compiler';
import { DispatchQueueService } from '../worker/dispatch-queue.service';
import { FailoverQueueService } from '../worker/failover-queue.service';
import type { Audience, ChannelPolicy, CreateCampaign } from './campaigns.schemas';

const DISPATCH_BATCH_SIZE = 50;
const INSERT_CHUNK_SIZE = 1000;

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchQueue: DispatchQueueService,
    private readonly failoverQueue: FailoverQueueService,
  ) {}

  async create(input: CreateCampaign) {
    if (input.segment_id) {
      const segment = await this.prisma.segment.findUnique({ where: { id: input.segment_id } });
      if (!segment) throw new NotFoundException({ error: 'segment_not_found' });
    }
    return this.prisma.campaign.create({
      data: {
        name: input.name,
        objective: input.objective,
        messageTemplate: input.message_template,
        channelPolicy: input.channel_policy,
        segmentId: input.segment_id,
        audienceJson: input.audience,
      },
    });
  }

  list() {
    return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException({ error: 'campaign_not_found' });
    return campaign;
  }

  /**
   * Launch: snapshot the audience NOW (the segment can drift later), create
   * QUEUED communication rows with rendered messages, enqueue dispatch jobs
   * in batches.
   */
  async launch(id: string) {
    const campaign = await this.get(id);
    if (campaign.status !== 'DRAFT') {
      throw new ConflictException({ error: 'campaign_already_launched' });
    }

    const policy = campaign.channelPolicy as ChannelPolicy;
    const audience = (campaign.audienceJson ?? {}) as Audience;
    const channel = policy.primary;

    // Customers must be reachable on the chosen channel.
    const contactFilter: Prisma.CustomerWhereInput =
      channel === 'email' ? { emailEnc: { not: null } } : { phoneEnc: { not: null } };

    // Segment campaigns compile the saved DSL; raw-audience campaigns keep
    // the Phase 1 filters. The DSL is re-validated even though it comes from
    // our own DB — validation at every boundary, including this one.
    let audienceWhere: Prisma.CustomerWhereInput;
    if (campaign.segmentId) {
      const segment = await this.prisma.segment.findUnique({ where: { id: campaign.segmentId } });
      if (!segment) throw new ConflictException({ error: 'segment_missing' });
      const dsl = segmentDslSchema.safeParse(segment.dslJson);
      if (!dsl.success) throw new ConflictException({ error: 'segment_dsl_invalid' });
      audienceWhere = compileSegmentDsl(dsl.data);
    } else {
      audienceWhere = {
        ...(audience.city ? { city: audience.city } : {}),
        ...(audience.min_total_spend !== undefined
          ? { totalSpend: { gte: audience.min_total_spend } }
          : {}),
        ...(audience.min_order_count !== undefined
          ? { orderCount: { gte: audience.min_order_count } }
          : {}),
      };
    }
    const where: Prisma.CustomerWhereInput = { AND: [contactFilter, audienceWhere] };

    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true, name: true, city: true },
      orderBy: { createdAt: 'desc' },
      ...(audience.limit ? { take: audience.limit } : {}),
    });

    if (customers.length === 0) {
      throw new ConflictException({ error: 'audience_is_empty' });
    }

    const communications = customers.map((customer) => ({
      id: randomUUID(),
      campaignId: campaign.id,
      customerId: customer.id,
      channel,
      messageRendered: renderTemplate(campaign.messageTemplate, customer),
    }));

    for (let i = 0; i < communications.length; i += INSERT_CHUNK_SIZE) {
      await this.prisma.communication.createMany({
        data: communications.slice(i, i + INSERT_CHUNK_SIZE),
      });
    }

    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'RUNNING',
        audienceSnapshotCount: communications.length,
        launchedAt: new Date(),
      },
    });

    const ids = communications.map((comm) => comm.id);
    for (let i = 0; i < ids.length; i += DISPATCH_BATCH_SIZE) {
      await this.dispatchQueue.enqueue({
        campaignId: campaign.id,
        communicationIds: ids.slice(i, i + DISPATCH_BATCH_SIZE),
      });
    }

    // First failover sweep one window from now. With no failover channels it
    // degrades to a finalization pass that marks the campaign COMPLETED.
    await this.failoverQueue.scheduleSweep(
      { campaignId: campaign.id, hop: 0 },
      policy.failoverWindowMinutes * 60_000,
    );

    this.logger.log(`Launched campaign ${campaign.id}: ${communications.length} communications`);
    return { campaign_id: campaign.id, audience_snapshot_count: communications.length };
  }

  /**
   * Stats are derived on read from communications + the append-only event
   * log. Stated tradeoff: at Xeno scale these become streaming aggregates;
   * here derived-on-read keeps the event log the single source of truth.
   */
  async stats(id: string) {
    const campaign = await this.get(id);

    const statusGroups = await this.prisma.communication.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    });
    const statusCounts = Object.fromEntries(COMMUNICATION_STATUSES.map((status) => [status, 0]));
    for (const group of statusGroups) {
      statusCounts[group.status] = group._count._all;
    }

    const eventGroups = await this.prisma.commEvent.groupBy({
      by: ['eventType'],
      where: { communication: { campaignId: id } },
      _count: { _all: true },
    });
    const eventCounts = Object.fromEntries(
      eventGroups.map((group) => [group.eventType, group._count._all]),
    );

    // Failover savings: children created by escalation, and how many of them
    // actually reached the customer on the fallback channel.
    const [escalations, rescued] = await Promise.all([
      this.prisma.communication.count({
        where: { campaignId: id, parentCommunicationId: { not: null } },
      }),
      this.prisma.communication.count({
        where: {
          campaignId: id,
          parentCommunicationId: { not: null },
          statusRank: { gte: STATUS_RANK.DELIVERED },
        },
      }),
    ]);

    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const reached = (atLeast: keyof typeof STATUS_RANK) =>
      Object.entries(statusCounts)
        .filter(
          ([status]) =>
            status !== 'FAILED' &&
            STATUS_RANK[status as keyof typeof STATUS_RANK] >= STATUS_RANK[atLeast],
        )
        .reduce((sum, [, count]) => sum + count, 0);

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        audience_snapshot_count: campaign.audienceSnapshotCount,
        launched_at: campaign.launchedAt,
      },
      total,
      status_counts: statusCounts,
      event_counts: eventCounts,
      funnel: {
        queued: statusCounts['QUEUED'],
        sent: reached('SENT'),
        delivered: reached('DELIVERED'),
        engaged: reached('OPENED'),
        clicked: reached('CLICKED'),
        failed: statusCounts['FAILED'],
      },
      failover: { escalations, rescued },
    };
  }
}

function renderTemplate(template: string, customer: { name: string; city: string | null }): string {
  return template
    .replaceAll('{{name}}', customer.name)
    .replaceAll('{{city}}', customer.city ?? 'your city');
}
