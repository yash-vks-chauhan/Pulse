import { describe, expect, it } from 'vitest';
import { planAttribution } from './attribution.logic';

const T0 = new Date('2026-06-13T12:00:00.000Z').getTime();
const hours = (n: number) => new Date(T0 + n * 3_600_000);

describe('planAttribution', () => {
  it('attributes an order to an engagement inside the window', () => {
    const plans = planAttribution(
      [{ id: 'o1', customerId: 'c1', orderedAt: hours(0) }],
      [{ id: 'm1', customerId: 'c1', lastEventAt: hours(-10) }],
    );
    expect(plans).toEqual([{ orderId: 'o1', communicationId: 'm1' }]);
  });

  it('ignores engagements outside the 72h window', () => {
    const plans = planAttribution(
      [{ id: 'o1', customerId: 'c1', orderedAt: hours(0) }],
      [{ id: 'm1', customerId: 'c1', lastEventAt: hours(-80) }],
    );
    expect(plans).toEqual([]);
  });

  it('never attributes to an engagement AFTER the order', () => {
    const plans = planAttribution(
      [{ id: 'o1', customerId: 'c1', orderedAt: hours(0) }],
      [{ id: 'm1', customerId: 'c1', lastEventAt: hours(2) }],
    );
    expect(plans).toEqual([]);
  });

  it('last-touch wins when several communications qualify', () => {
    const plans = planAttribution(
      [{ id: 'o1', customerId: 'c1', orderedAt: hours(0) }],
      [
        { id: 'older', customerId: 'c1', lastEventAt: hours(-50) },
        { id: 'newest', customerId: 'c1', lastEventAt: hours(-1) },
        { id: 'middle', customerId: 'c1', lastEventAt: hours(-20) },
      ],
    );
    expect(plans).toEqual([{ orderId: 'o1', communicationId: 'newest' }]);
  });

  it('never crosses customers', () => {
    const plans = planAttribution(
      [{ id: 'o1', customerId: 'c1', orderedAt: hours(0) }],
      [{ id: 'm1', customerId: 'c2', lastEventAt: hours(-1) }],
    );
    expect(plans).toEqual([]);
  });

  it('handles batches: one plan per attributable order', () => {
    const plans = planAttribution(
      [
        { id: 'o1', customerId: 'c1', orderedAt: hours(0) },
        { id: 'o2', customerId: 'c2', orderedAt: hours(0) },
        { id: 'o3', customerId: 'c3', orderedAt: hours(0) },
      ],
      [
        { id: 'm1', customerId: 'c1', lastEventAt: hours(-5) },
        { id: 'm2', customerId: 'c2', lastEventAt: hours(-100) },
      ],
    );
    expect(plans).toEqual([{ orderId: 'o1', communicationId: 'm1' }]);
  });

  it('respects a custom window', () => {
    const plans = planAttribution(
      [{ id: 'o1', customerId: 'c1', orderedAt: hours(0) }],
      [{ id: 'm1', customerId: 'c1', lastEventAt: hours(-10) }],
      8,
    );
    expect(plans).toEqual([]);
  });
});
