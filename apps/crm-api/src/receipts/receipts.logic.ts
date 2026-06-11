import {
  EVENT_TO_STATUS,
  STATUS_RANK,
  shouldAdvance,
  type CallbackEvent,
  type CommunicationStatus,
} from '@pulse/shared';

/**
 * Pure planning step for a receipts batch — separated from I/O so the
 * idempotency + ordering rules are directly unit-testable.
 *
 * Rules (rehearsed answers from the README):
 *  - Duplicate event?  idempotency key `${message_id}:${event}` collides →
 *    counted as duplicate, no state change.
 *  - Out of order?     statuses have ranks; events only ever move state
 *    forward. A late `delivered` after `clicked` is recorded in the event log
 *    but does not downgrade the status.
 *  - Unknown message?  counted and skipped — never a 500 (webhooks must not
 *    poison the vendor's retry queue).
 */

export interface ReceiptInsert {
  communicationId: string;
  eventType: string;
  eventTs: Date;
  idempotencyKey: string;
  payload: { event_id: string; channel: string };
}

export interface ReceiptPlan {
  inserts: ReceiptInsert[];
  /** communicationId → target status (already filtered to forward-only moves). */
  statusUpdates: Map<string, CommunicationStatus>;
  inBatchDuplicates: number;
  unknown: number;
}

export function planReceiptBatch(
  events: CallbackEvent[],
  currentStatusById: ReadonlyMap<string, CommunicationStatus>,
): ReceiptPlan {
  const inserts: ReceiptInsert[] = [];
  const seenKeys = new Set<string>();
  const statusUpdates = new Map<string, CommunicationStatus>();
  let inBatchDuplicates = 0;
  let unknown = 0;

  for (const event of events) {
    const current = currentStatusById.get(event.message_id);
    if (!current) {
      unknown++;
      continue;
    }

    const idempotencyKey = `${event.message_id}:${event.event}`;
    if (seenKeys.has(idempotencyKey)) {
      inBatchDuplicates++;
      continue;
    }
    seenKeys.add(idempotencyKey);

    inserts.push({
      communicationId: event.message_id,
      eventType: event.event,
      eventTs: new Date(event.ts),
      idempotencyKey,
      payload: { event_id: event.event_id, channel: event.channel },
    });

    const nextStatus = EVENT_TO_STATUS[event.event];
    const pending = statusUpdates.get(event.message_id) ?? current;
    if (shouldAdvance(pending, nextStatus)) {
      statusUpdates.set(event.message_id, nextStatus);
    }
  }

  return { inserts, statusUpdates, inBatchDuplicates, unknown };
}

export function rankOf(status: CommunicationStatus): number {
  return STATUS_RANK[status];
}
