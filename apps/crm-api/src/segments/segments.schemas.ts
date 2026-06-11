import { segmentDslSchema } from '@pulse/shared';
import { z } from 'zod';

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(200),
  dsl: segmentDslSchema,
  created_from: z.enum(['nl', 'manual']).default('manual'),
  /** The natural-language prompt the DSL was compiled from, for provenance. */
  nl_prompt: z.string().max(1000).optional(),
});
export type CreateSegment = z.infer<typeof createSegmentSchema>;

export const previewSegmentSchema = z.object({
  dsl: segmentDslSchema,
  sample_size: z.number().int().min(0).max(10).default(5),
});
export type PreviewSegment = z.infer<typeof previewSegmentSchema>;
