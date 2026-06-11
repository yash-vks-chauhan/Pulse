import { CHANNELS } from '@pulse/shared';
import { z } from 'zod';

export const channelPolicySchema = z.object({
  primary: z.enum(CHANNELS),
  /** Ordered failover list — escalation logic lands in Phase 2. */
  failover: z.array(z.enum(CHANNELS)).max(3).default([]),
  failoverWindowMinutes: z.number().int().min(5).max(1440).default(60),
});
export type ChannelPolicy = z.infer<typeof channelPolicySchema>;

/**
 * Raw audience filters. Segment campaigns use the DSL instead; follow-up
 * campaigns target the reached-but-never-engaged slice of a past campaign.
 */
export const audienceSchema = z.object({
  limit: z.number().int().min(1).max(50_000).optional(),
  city: z.string().min(1).max(100).optional(),
  min_total_spend: z.number().nonnegative().optional(),
  min_order_count: z.number().int().nonnegative().optional(),
  /** Customers DELIVERED in this campaign but never OPENED/READ/CLICKED. */
  not_engaged_in_campaign_id: z.string().uuid().optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  objective: z.string().max(500).optional(),
  /** Merge tags: {{name}}, {{city}}. Rendered per customer at launch. */
  message_template: z.string().min(1).max(2000),
  channel_policy: channelPolicySchema,
  /** Target a saved segment (Phase 2). Wins over `audience` when present. */
  segment_id: z.string().uuid().optional(),
  audience: audienceSchema.default({}),
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
