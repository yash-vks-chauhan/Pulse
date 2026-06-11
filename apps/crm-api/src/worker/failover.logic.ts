import { STATUS_RANK, type Channel } from '@pulse/shared';

/**
 * Pure failover-escalation rules (unit-tested; the worker is just plumbing).
 *
 * A campaign's channel policy compiles to an ordered, de-duplicated channel
 * sequence: [primary, ...failover]. A sweep at hop N looks at communications
 * on channel seq[N] and escalates the ones that stalled to seq[N+1] by
 * creating a linked child communication.
 */

export interface FailoverPolicyShape {
  primary: Channel;
  failover: Channel[];
  failoverWindowMinutes: number;
}

export function channelSequence(policy: FailoverPolicyShape): Channel[] {
  const sequence: Channel[] = [];
  for (const channel of [policy.primary, ...policy.failover]) {
    if (!sequence.includes(channel)) sequence.push(channel);
  }
  return sequence;
}

/**
 * Escalate only communications that were handed to the vendor and did not
 * reach the customer: SENT (no delivery receipt inside the window) and FAILED
 * (hard failure, including dead-lettered dispatches). QUEUED rows are still
 * inside our own dispatch pipeline — escalating them would risk a double
 * send; if dispatch ultimately gives up they become FAILED and the next
 * sweep picks them up.
 */
export const ESCALATION_RANK_RANGE = {
  gte: STATUS_RANK.SENT,
  lt: STATUS_RANK.DELIVERED,
} as const;

export function needsEscalation(statusRank: number): boolean {
  return statusRank >= ESCALATION_RANK_RANGE.gte && statusRank < ESCALATION_RANK_RANGE.lt;
}
