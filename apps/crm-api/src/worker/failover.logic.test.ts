import { STATUS_RANK } from '@pulse/shared';
import { describe, expect, it } from 'vitest';
import { channelSequence, needsEscalation } from './failover.logic';

describe('channelSequence', () => {
  it('orders primary first, then failover channels', () => {
    expect(
      channelSequence({ primary: 'whatsapp', failover: ['sms', 'email'], failoverWindowMinutes: 60 }),
    ).toEqual(['whatsapp', 'sms', 'email']);
  });

  it('de-duplicates a failover entry that repeats the primary', () => {
    expect(
      channelSequence({ primary: 'whatsapp', failover: ['whatsapp', 'sms'], failoverWindowMinutes: 60 }),
    ).toEqual(['whatsapp', 'sms']);
  });

  it('is just the primary when no failover is configured', () => {
    expect(channelSequence({ primary: 'email', failover: [], failoverWindowMinutes: 60 })).toEqual([
      'email',
    ]);
  });
});

describe('needsEscalation', () => {
  it('escalates SENT (no delivery inside the window) and FAILED', () => {
    expect(needsEscalation(STATUS_RANK.SENT)).toBe(true);
    expect(needsEscalation(STATUS_RANK.FAILED)).toBe(true);
  });

  it('does not escalate QUEUED — still inside our own dispatch pipeline', () => {
    expect(needsEscalation(STATUS_RANK.QUEUED)).toBe(false);
  });

  it('does not escalate anything the customer already received', () => {
    expect(needsEscalation(STATUS_RANK.DELIVERED)).toBe(false);
    expect(needsEscalation(STATUS_RANK.READ)).toBe(false);
    expect(needsEscalation(STATUS_RANK.CLICKED)).toBe(false);
    expect(needsEscalation(STATUS_RANK.CONVERTED)).toBe(false);
  });
});
