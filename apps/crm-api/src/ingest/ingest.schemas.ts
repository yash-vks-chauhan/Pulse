import { z } from 'zod';

/**
 * Ingestion contracts. Batch-friendly (up to 1,000 rows per request),
 * strictly validated, and idempotent: rows are keyed by caller-supplied
 * external_id, so re-sending the same batch is always safe.
 */

export const customerInputSchema = z.object({
  external_id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional().nullable(),
  phone: z
    .string()
    .regex(/^\+?[0-9][0-9 \-()]{6,19}$/, 'phone must be 7-20 digits, optionally with +, spaces, dashes')
    .optional()
    .nullable(),
  city: z.string().min(1).max(100).optional().nullable(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const customersBatchSchema = z.object({
  customers: z.array(customerInputSchema).min(1).max(1000),
});
export type CustomersBatch = z.infer<typeof customersBatchSchema>;

export const orderItemSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  qty: z.number().int().positive().max(1000),
  price: z.number().nonnegative().max(10_000_000),
});

export const orderInputSchema = z.object({
  external_id: z.string().min(1).max(100),
  customer_external_id: z.string().min(1).max(100),
  amount: z.number().positive().max(10_000_000),
  items: z.array(orderItemSchema).max(100).optional(),
  ordered_at: z.string().datetime(),
  source: z.string().min(1).max(50).optional(),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const ordersBatchSchema = z.object({
  orders: z.array(orderInputSchema).min(1).max(1000),
});
export type OrdersBatch = z.infer<typeof ordersBatchSchema>;
