import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { STATUS_RANK, type Channel } from '@pulse/shared';
import { AiService } from '../ai/ai.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATTRIBUTION_WINDOW_HOURS,
  planAttribution,
  type AttributableOrder,
} from './attribution.logic';
import type { FollowUpRequest } from './insights.schemas';

const CHUNK = 200;
const DEFAULT_FOLLOWUP_TEMPLATE =
  'Hi {{name}}, in case you missed it — we saved something special for you. Take a look before it’s gone!';

export interface ChannelBreakdown {
  channel: Channel;
  attempted: number;
  delivered: number;
  engaged: number;
  clicked: number;
  converted: number;
  failed: number;
  delivery_rate: number;
}

/**
 * Insights: attribution (orders → CONVERTED communications), per-channel
 * performance, attributed revenue, and an AI-written narrative with a
 * one-click follow-up. The AI sees aggregate numbers only — never PII — and
 * everything it returns is schema-validated. Without an API key the narrative
 * degrades to an honest heuristic readout.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly campaigns: CampaignsService,
  ) {}

  // ── Attribution (called from order ingest) ──────────────────────────────────

  /**
   * Last-touch attribution inside the 72h window. Idempotent: attribution is
   * keyed by order, the CONVERTED advance is rank-guarded, and the converted
   * event carries a deterministic idempotency key.
   */
  async attributeNewOrders(orders: AttributableOrder[]): Promise<number> {
    if (orders.length === 0) return 0;

    const customerIds = [...new Set(orders.map((order) => order.customerId))];
    const engaged = await this.prisma.communication.findMany({
      where: {
        customerId: { in: customerIds },
        statusRank: { gte: STATUS_RANK.READ },
        lastEventAt: { not: null },
      },
      select: { id: true, customerId: true, lastEventAt: true },
    });

    const plans = planAttribution(
      orders,
      engaged.map((comm) => ({
        id: comm.id,
        customerId: comm.customerId,
        lastEventAt: comm.lastEventAt!,
      })),
    );
    if (plans.length === 0) return 0;

    const orderById = new Map(orders.map((order) => [order.id, order]));
    for (let i = 0; i < plans.length; i += CHUNK) {
      const slice = plans.slice(i, i + CHUNK);
      await this.prisma.$transaction([
        ...slice.map((plan) =>
          this.prisma.order.updateMany({
            where: { id: plan.orderId, attributedCommunicationId: null },
            data: { attributedCommunicationId: plan.communicationId },
          }),
        ),
        ...slice.map((plan) =>
          this.prisma.communication.updateMany({
            where: { id: plan.communicationId, statusRank: { lt: STATUS_RANK.CONVERTED } },
            data: {
              status: 'CONVERTED',
              statusRank: STATUS_RANK.CONVERTED,
              lastEventAt: orderById.get(plan.orderId)?.orderedAt,
            },
          }),
        ),
        this.prisma.commEvent.createMany({
          data: slice.map((plan) => ({
            communicationId: plan.communicationId,
            eventType: 'converted',
            eventTs: orderById.get(plan.orderId)?.orderedAt ?? new Date(),
            idempotencyKey: `${plan.communicationId}:converted`,
            payload: { order_id: plan.orderId },
          })),
          skipDuplicates: true,
        }),
      ]);
    }

    this.logger.log(`Attributed ${plans.length} orders (window ${ATTRIBUTION_WINDOW_HOURS}h)`);
    return plans.length;
  }

  // ── Campaign insights ───────────────────────────────────────────────────────

  async campaignInsights(campaignId: string) {
    const stats = await this.campaigns.stats(campaignId);

    const [channelGroups, revenue, nonEngagedCount] = await Promise.all([
      this.prisma.communication.groupBy({
        by: ['channel', 'status'],
        where: { campaignId },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { attributedCommunication: { campaignId } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.countNonEngaged(campaignId),
    ]);

    const channels = this.buildChannelBreakdown(channelGroups);
    const attributedRevenue = Number(revenue._sum.amount ?? 0);
    const conversions = revenue._count._all;

    const aggregate = {
      campaign: stats.campaign,
      funnel: stats.funnel,
      failover: stats.failover,
      channels,
      revenue: {
        attributed_orders: conversions,
        attributed_revenue: attributedRevenue,
        attribution_window_hours: ATTRIBUTION_WINDOW_HOURS,
      },
      non_engaged_audience: nonEngagedCount,
    };

    const narrative = await this.narrate(aggregate);

    return {
      ...aggregate,
      narrative,
      suggested_follow_up: {
        channel: narrative.follow_up_channel,
        objective: narrative.follow_up_objective,
        audience: 'non_engaged',
        estimated_audience: nonEngagedCount,
      },
    };
  }

  /** Delivered but never opened/read/clicked — the follow-up audience. */
  private countNonEngaged(campaignId: string): Promise<number> {
    return this.prisma.customer.count({
      where: {
        AND: [
          {
            communications: {
              some: { campaignId, statusRank: { gte: STATUS_RANK.DELIVERED } },
            },
          },
          {
            communications: {
              none: { campaignId, statusRank: { gte: STATUS_RANK.OPENED } },
            },
          },
        ],
      },
    });
  }

  private buildChannelBreakdown(
    groups: Array<{ channel: Channel; status: string; _count: { _all: number } }>,
  ): ChannelBreakdown[] {
    const breakdown = new Map<Channel, ChannelBreakdown>();
    for (const group of groups) {
      const entry = breakdown.get(group.channel) ?? {
        channel: group.channel,
        attempted: 0,
        delivered: 0,
        engaged: 0,
        clicked: 0,
        converted: 0,
        failed: 0,
        delivery_rate: 0,
      };
      const count = group._count._all;
      const rank = STATUS_RANK[group.status as keyof typeof STATUS_RANK] ?? 0;
      entry.attempted += count;
      if (group.status === 'FAILED') entry.failed += count;
      else {
        if (rank >= STATUS_RANK.DELIVERED) entry.delivered += count;
        if (rank >= STATUS_RANK.OPENED) entry.engaged += count;
        if (rank >= STATUS_RANK.CLICKED) entry.clicked += count;
        if (rank >= STATUS_RANK.CONVERTED) entry.converted += count;
      }
      breakdown.set(group.channel, entry);
    }
    for (const entry of breakdown.values()) {
      entry.delivery_rate =
        entry.attempted > 0 ? Math.round((entry.delivered / entry.attempted) * 1000) / 10 : 0;
    }
    return [...breakdown.values()].sort((a, b) => b.attempted - a.attempted);
  }

  /** AI narrative when configured; honest heuristic readout otherwise. */
  private async narrate(aggregate: {
    funnel: { sent: number; delivered: number; failed: number | undefined };
    failover: { escalations: number; rescued: number };
    channels: ChannelBreakdown[];
    revenue: { attributed_orders: number; attributed_revenue: number };
    non_engaged_audience: number;
  }) {
    if (this.ai.configured) {
      try {
        const ai = await this.ai.summarizeCampaign(aggregate);
        return { source: 'ai' as const, ...ai };
      } catch (error) {
        // Insights must never 5xx because the narrative failed — fall through.
        this.logger.warn(`AI narrative failed, using heuristic: ${(error as Error).message}`);
      }
    }
    return { source: 'heuristic' as const, ...this.heuristicNarrative(aggregate) };
  }

  private heuristicNarrative(aggregate: {
    funnel: { sent: number; delivered: number; failed: number | undefined };
    failover: { escalations: number; rescued: number };
    channels: ChannelBreakdown[];
    revenue: { attributed_orders: number; attributed_revenue: number };
    non_engaged_audience: number;
  }) {
    const { funnel, failover, channels, revenue, non_engaged_audience } = aggregate;
    const attempted = funnel.sent + (funnel.failed ?? 0);
    const deliveryRate = attempted > 0 ? Math.round((funnel.delivered / attempted) * 100) : 0;

    const active = channels.filter((entry) => entry.attempted > 0);
    const best = [...active].sort((a, b) => b.delivery_rate - a.delivery_rate)[0];
    const worst = [...active].sort((a, b) => a.delivery_rate - b.delivery_rate)[0];

    const parts = [`Delivery landed at ${deliveryRate}% of attempted sends.`];
    if (best && worst && best.channel !== worst.channel) {
      parts.push(
        `${best.channel} performed best (${best.delivery_rate}% delivered) while ${worst.channel} lagged (${worst.delivery_rate}%).`,
      );
    }
    if (failover.rescued > 0) {
      parts.push(
        `Failover rescued ${failover.rescued} customers who would otherwise have been missed.`,
      );
    }
    if (revenue.attributed_orders > 0) {
      parts.push(
        `${revenue.attributed_orders} orders (₹${revenue.attributed_revenue.toLocaleString('en-IN')}) are attributed to this campaign.`,
      );
    }

    const followUpChannel = this.pickFollowUpChannel(active);
    return {
      summary: parts.join(' '),
      recommendation:
        non_engaged_audience > 0
          ? `${non_engaged_audience} customers received the message but never engaged — send a short ${followUpChannel} follow-up to just that group.`
          : 'Engagement covered the reachable audience — focus the next campaign on a fresh segment.',
      follow_up_channel: followUpChannel,
      follow_up_objective: `Re-engage customers who saw the campaign but did not respond, with a gentle reminder and a clear call to action on ${followUpChannel}.`,
    };
  }

  private pickFollowUpChannel(active: ChannelBreakdown[]): Channel {
    const used = new Set(active.map((entry) => entry.channel));
    const preferred: Channel[] = ['sms', 'email', 'whatsapp', 'rcs'];
    for (const channel of preferred) {
      if (!used.has(channel)) return channel;
    }
    const best = [...active].sort((a, b) => b.delivery_rate - a.delivery_rate)[0];
    return best?.channel ?? 'email';
  }

  // ── One-click follow-up ─────────────────────────────────────────────────────

  /**
   * Creates a DRAFT follow-up campaign targeting the customers who were
   * reached but never engaged. The marketer still reviews and launches it —
   * AI proposes, human approves, same as everywhere else.
   */
  async createFollowUp(campaignId: string, input: FollowUpRequest) {
    const parent = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!parent) throw new NotFoundException({ error: 'campaign_not_found' });

    const channelGroups = await this.prisma.communication.groupBy({
      by: ['channel', 'status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const heuristic = this.heuristicNarrative({
      funnel: { sent: 0, delivered: 0, failed: 0 },
      failover: { escalations: 0, rescued: 0 },
      channels: this.buildChannelBreakdown(channelGroups),
      revenue: { attributed_orders: 0, attributed_revenue: 0 },
      non_engaged_audience: 0,
    });

    const channel = input.channel ?? heuristic.follow_up_channel;
    const objective = input.objective ?? heuristic.follow_up_objective;

    let messageTemplate = input.message_template;
    if (!messageTemplate && this.ai.configured) {
      try {
        const draft = await this.ai.draftMessages({
          objective,
          channel,
          audience_summary: `Customers reached by "${parent.name}" who did not engage`,
          variant_count: 1,
        });
        messageTemplate = draft.variants[0]?.text;
      } catch (error) {
        this.logger.warn(`Follow-up draft failed, using default: ${(error as Error).message}`);
      }
    }

    return this.campaigns.create({
      name: input.name ?? `${parent.name} — follow-up`,
      objective,
      message_template: messageTemplate ?? DEFAULT_FOLLOWUP_TEMPLATE,
      channel_policy: {
        primary: channel,
        failover: input.failover.filter((entry) => entry !== channel),
        failoverWindowMinutes: input.failover_window_minutes,
      },
      audience: { not_engaged_in_campaign_id: campaignId },
    });
  }
}
