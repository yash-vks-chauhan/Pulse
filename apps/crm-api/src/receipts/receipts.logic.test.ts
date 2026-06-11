import type { CallbackEvent, CommunicationStatus } from '@pulse/shared';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { planReceiptBatch } from './receipts.logic';

function event(messageId: string, type: CallbackEvent['event']): CallbackEvent {
  return {
    event_id: randomUUID(),
    message_id: messageId,
    event: type,
    channel: 'whatsapp',
    ts: new Date().toISOString(),
  };
}

const COMM_A = randomUUID();
const COMM_B = randomUUID();

function statuses(entries: Record<string, CommunicationStatus>) {
  return new Map(Object.entries(entries));
}

describe('planReceiptBatch', () => {
  it('advances status on the happy path', () => {
    const plan = planReceiptBatch([event(COMM_A, 'delivered')], statuses({ [COMM_A]: 'SENT' }));
    expect(plan.inserts).toHaveLength(1);
    expect(plan.statusUpdates.get(COMM_A)).toBe('DELIVERED');
    expect(plan.unknown).toBe(0);
  });

  it('records a late delivered after clicked without downgrading', () => {
    const plan = planReceiptBatch([event(COMM_A, 'delivered')], statuses({ [COMM_A]: 'CLICKED' }));
    expect(plan.inserts).toHaveLength(1); // event log is append-only
    expect(plan.statusUpdates.has(COMM_A)).toBe(false); // status untouched
  });

  it('takes the highest-ranked event when a batch arrives out of order', () => {
    const plan = planReceiptBatch(
      [event(COMM_A, 'clicked'), event(COMM_A, 'delivered'), event(COMM_A, 'read')],
      statuses({ [COMM_A]: 'SENT' }),
    );
    expect(plan.statusUpdates.get(COMM_A)).toBe('CLICKED');
    expect(plan.inserts).toHaveLength(3);
  });

  it('dedupes duplicate events inside one batch', () => {
    const duplicate = event(COMM_A, 'delivered');
    const plan = planReceiptBatch([duplicate, duplicate], statuses({ [COMM_A]: 'SENT' }));
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inBatchDuplicates).toBe(1);
  });

  it('counts unknown message ids without failing', () => {
    const plan = planReceiptBatch(
      [event(randomUUID(), 'delivered'), event(COMM_B, 'failed')],
      statuses({ [COMM_B]: 'SENT' }),
    );
    expect(plan.unknown).toBe(1);
    expect(plan.statusUpdates.get(COMM_B)).toBe('FAILED');
  });

  it('prefers a delivery receipt over a failure in the same batch', () => {
    const plan = planReceiptBatch(
      [event(COMM_A, 'failed'), event(COMM_A, 'delivered')],
      statuses({ [COMM_A]: 'SENT' }),
    );
    expect(plan.statusUpdates.get(COMM_A)).toBe('DELIVERED');
  });
});
