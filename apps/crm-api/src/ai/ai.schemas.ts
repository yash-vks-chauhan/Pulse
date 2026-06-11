import { CHANNELS } from '@pulse/shared';
import { z } from 'zod';

/** NL → Segment DSL. The prompt is bounded — it is untrusted input AND paid
 *  LLM input, so both security and cost argue for a tight cap. */
export const nlSegmentRequestSchema = z.object({
  prompt: z.string().min(3).max(500),
});
export type NlSegmentRequest = z.infer<typeof nlSegmentRequestSchema>;

export const draftRequestSchema = z.object({
  objective: z.string().min(3).max(500),
  channel: z.enum(CHANNELS),
  /** Optional human-readable audience description shown to the model. */
  audience_summary: z.string().max(500).optional(),
  variant_count: z.number().int().min(1).max(3).default(3),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;
