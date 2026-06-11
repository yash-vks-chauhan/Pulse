import { describe, expect, it } from 'vitest';
import {
  CALLBACK_EVENT_TYPES,
  EVENT_TO_STATUS,
  STATUS_RANK,
  highestStatus,
  shouldAdvance,
} from './status';

describe('communication state machine', () => {
  it('orders the happy path strictly forward', () => {
    const path = ['QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'READ', 'CLICKED', 'CONVERTED'] as const;
    for (let i = 1; i < path.length; i++) {
      expect(STATUS_RANK[path[i]!]).toBeGreaterThan(STATUS_RANK[path[i - 1]!]);
    }
  });

  it('never downgrades: late delivered after clicked is ignored', () => {
    expect(shouldAdvance('CLICKED', 'DELIVERED')).toBe(false);
  });

  it('advances out-of-order: clicked can arrive before delivered', () => {
    expect(shouldAdvance('SENT', 'CLICKED')).toBe(true);
    expect(shouldAdvance('CLICKED', 'CLICKED')).toBe(false);
  });

  it('treats a delivery receipt as ground truth over a failure', () => {
    expect(shouldAdvance('FAILED', 'DELIVERED')).toBe(true);
    expect(shouldAdvance('DELIVERED', 'FAILED')).toBe(false);
  });

  it('maps every callback event type to a status', () => {
    for (const event of CALLBACK_EVENT_TYPES) {
      expect(EVENT_TO_STATUS[event]).toBeDefined();
    }
  });

  it('picks the highest-ranked status from a batch', () => {
    expect(highestStatus(['DELIVERED', 'CLICKED', 'FAILED'])).toBe('CLICKED');
    expect(highestStatus([])).toBeUndefined();
  });
});
