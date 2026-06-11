import { z } from 'zod';
import { CALLBACK_EVENT_TYPES, type CallbackEventType } from './status';

/** All channels from the brief. */
export const CHANNELS = ['whatsapp', 'sms', 'email', 'rcs'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Channel-correct event vocabularies — realism signal from the brief:
 * WhatsApp/RCS emit delivered/read/clicked, Email emits delivered/opened/clicked,
 * SMS emits delivered/failed/clicked only. No fake "read" events on channels
 * that do not support them. `failed` is possible everywhere.
 */
export const CHANNEL_EVENT_VOCABULARY: Record<Channel, readonly CallbackEventType[]> = {
  whatsapp: ['delivered', 'failed', 'read', 'clicked'],
  rcs: ['delivered', 'failed', 'read', 'clicked'],
  email: ['delivered', 'failed', 'opened', 'clicked'],
  sms: ['delivered', 'failed', 'clicked'],
};

/** A single delivery callback event (Simulator → CRM). */
export const callbackEventSchema = z.object({
  /** Unique per emission — duplicates reuse the same id (idempotency test). */
  event_id: z.string().uuid(),
  /** The CRM's message id, echoed back by the vendor. */
  message_id: z.string().uuid(),
  event: z.enum(CALLBACK_EVENT_TYPES),
  channel: z.enum(CHANNELS),
  ts: z.string().datetime(),
});
export type CallbackEvent = z.infer<typeof callbackEventSchema>;

/** Simulator → CRM: POST /api/receipts */
export const receiptsRequestSchema = z.object({
  events: z.array(callbackEventSchema).min(1).max(500),
});
export type ReceiptsRequest = z.infer<typeof receiptsRequestSchema>;

export const receiptsResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
export type ReceiptsResponse = z.infer<typeof receiptsResponseSchema>;
