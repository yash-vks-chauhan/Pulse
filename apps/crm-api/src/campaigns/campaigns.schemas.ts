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
 * Raw audience filters for Phase 1 launches. Phase 2 replaces this with the
 * Segment DSL (NL → DSL → compiled query).
 */
export const audienceSchema = z.object({
  limit: z.number().int().min(1).max(50_000).optional(),
  city: z.string().min(1).max(100).optional(),
  min_total_spend: z.number().nonnegative().optional(),
  min_order_count: z.number().int().nonnegative().optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  objective: z.string().max(500).optional(),
  /** Merge tags: {{name}}, {{city}}. Rendered per customer at launch. */
  message_template: z.string().min(1).max(2000),
  channel_policy: channelPolicySchema,
  audience: audienceSchema.default({}),
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
