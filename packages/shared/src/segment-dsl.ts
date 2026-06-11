import { z } from 'zod';

/**
 * Segment DSL — the only artifact the LLM is allowed to produce.
 *
 * The LLM never writes SQL and never touches the database. It emits this JSON
 * document; the document is schema-validated here, then compiled by the CRM
 * into a parameterized Prisma query. Whitelisted fields + operators only —
 * anything outside the schema is rejected and the AI is asked to retry.
 */

export const NUMERIC_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
export const DATE_OPS = ['older_than_days', 'within_days'] as const;
export const STRING_OPS = ['eq', 'neq', 'contains'] as const;
export const ARRAY_OPS = ['includes'] as const;

export const SEGMENT_FIELDS = {
  total_spend: { type: 'numeric', ops: NUMERIC_OPS },
  order_count: { type: 'numeric', ops: NUMERIC_OPS },
  last_order_at: { type: 'date', ops: DATE_OPS },
  created_at: { type: 'date', ops: DATE_OPS },
  city: { type: 'string', ops: STRING_OPS },
  tags: { type: 'array', ops: ARRAY_OPS },
} as const;

export type SegmentField = keyof typeof SEGMENT_FIELDS;

const numericCondition = z.object({
  field: z.enum(['total_spend', 'order_count']),
  op: z.enum(NUMERIC_OPS),
  value: z.number().finite().nonnegative(),
});

const dateCondition = z.object({
  field: z.enum(['last_order_at', 'created_at']),
  op: z.enum(DATE_OPS),
  value: z.number().int().positive().max(3650),
});

const stringCondition = z.object({
  field: z.literal('city'),
  op: z.enum(STRING_OPS),
  value: z.string().min(1).max(100),
});

const arrayCondition = z.object({
  field: z.literal('tags'),
  op: z.enum(ARRAY_OPS),
  value: z.string().min(1).max(50),
});

export const segmentConditionSchema = z.union([
  numericCondition,
  dateCondition,
  stringCondition,
  arrayCondition,
]);
export type SegmentCondition = z.infer<typeof segmentConditionSchema>;

export const segmentDslSchema = z.object({
  logic: z.enum(['AND', 'OR']),
  conditions: z.array(segmentConditionSchema).min(1).max(10),
});
export type SegmentDsl = z.infer<typeof segmentDslSchema>;
