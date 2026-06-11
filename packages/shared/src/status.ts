/**
 * Per-customer communication state machine.
 *
 * QUEUED → SENT → DELIVERED → OPENED → READ → CLICKED → CONVERTED
 *             ↘ FAILED → (failover policy) → retry on next channel
 *
 * Callbacks arrive out of order and duplicated. Every status has a rank and
 * state only ever moves to a strictly higher rank — a late `delivered` after
 * `clicked` is recorded in the event log but never downgrades the status.
 *
 * FAILED ranks below DELIVERED deliberately: if both a failure and a delivery
 * receipt exist for the same message, the delivery receipt is ground truth.
 */

export const COMMUNICATION_STATUSES = [
  'QUEUED',
  'SENT',
  'FAILED',
  'DELIVERED',
  'OPENED',
  'READ',
  'CLICKED',
  'CONVERTED',
] as const;

export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export const STATUS_RANK: Record<CommunicationStatus, number> = {
  QUEUED: 0,
  SENT: 10,
  FAILED: 15,
  DELIVERED: 20,
  OPENED: 30,
  READ: 40,
  CLICKED: 50,
  CONVERTED: 60,
};

/** Events the simulator emits over the receipts webhook. */
export const CALLBACK_EVENT_TYPES = ['delivered', 'failed', 'opened', 'read', 'clicked'] as const;
export type CallbackEventType = (typeof CALLBACK_EVENT_TYPES)[number];

export const EVENT_TO_STATUS: Record<CallbackEventType, CommunicationStatus> = {
  delivered: 'DELIVERED',
  failed: 'FAILED',
  opened: 'OPENED',
  read: 'READ',
  clicked: 'CLICKED',
};

/** True if moving to `next` is a forward transition (never downgrade). */
export function shouldAdvance(current: CommunicationStatus, next: CommunicationStatus): boolean {
  return STATUS_RANK[next] > STATUS_RANK[current];
}

/** The highest-ranked status among `candidates`, or undefined when empty. */
export function highestStatus(
  candidates: readonly CommunicationStatus[],
): CommunicationStatus | undefined {
  let best: CommunicationStatus | undefined;
  for (const status of candidates) {
    if (best === undefined || STATUS_RANK[status] > STATUS_RANK[best]) best = status;
  }
  return best;
}
