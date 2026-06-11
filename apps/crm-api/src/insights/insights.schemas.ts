import { CHANNELS } from '@pulse/shared';
import { z } from 'zod';

/** One-click follow-up creation. Everything is optional — defaults come from
 *  the insights recommendation (channel, objective) and a safe template. */
export const followUpRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: z.enum(CHANNELS).optional(),
  objective: z.string().min(3).max(500).optional(),
  message_template: z.string().min(1).max(2000).optional(),
  failover: z.array(z.enum(CHANNELS)).max(3).default([]),
  failover_window_minutes: z.number().int().min(5).max(1440).default(60),
});
export type FollowUpRequest = z.infer<typeof followUpRequestSchema>;
