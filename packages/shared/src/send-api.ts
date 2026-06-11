import { z } from 'zod';
import { CHANNELS } from './events';

/** One personalised message inside a send batch (CRM → Simulator). */
export const sendMessageSchema = z.object({
  message_id: z.string().uuid(),
  channel: z.enum(CHANNELS),
  /** Phone (whatsapp/sms/rcs) or email address (email). */
  recipient: z.string().min(3).max(254),
  body: z.string().min(1).max(4096),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

/** CRM → Simulator: POST /send */
export const sendRequestSchema = z.object({
  batch_id: z.string().uuid(),
  messages: z.array(sendMessageSchema).min(1).max(500),
  /** Where delivery receipts must be POSTed. Validated against an allowlist. */
  callback_url: z.string().url(),
});
export type SendRequest = z.infer<typeof sendRequestSchema>;

export const sendResponseSchema = z.object({
  accepted: z.array(z.string().uuid()),
  /** Throttled by per-channel rate limits — the CRM re-enqueues with backoff. */
  throttled: z.array(z.string().uuid()),
  rejected: z.array(z.object({ message_id: z.string().uuid(), reason: z.string() })),
});
export type SendResponse = z.infer<typeof sendResponseSchema>;
