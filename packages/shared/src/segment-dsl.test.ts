import { describe, expect, it } from 'vitest';
import { segmentDslSchema } from './segment-dsl';

describe('segment DSL schema', () => {
  it('accepts the canonical win-back segment from the README', () => {
    const dsl = {
      logic: 'AND',
      conditions: [
        { field: 'order_count', op: 'gte', value: 2 },
        { field: 'last_order_at', op: 'older_than_days', value: 60 },
        { field: 'total_spend', op: 'gt', value: 2000 },
      ],
    };
    expect(segmentDslSchema.safeParse(dsl).success).toBe(true);
  });

  it('rejects non-whitelisted fields (no LLM free-for-all)', () => {
    const dsl = {
      logic: 'AND',
      conditions: [{ field: 'password_hash', op: 'eq', value: 'x' }],
    };
    expect(segmentDslSchema.safeParse(dsl).success).toBe(false);
  });

  it('rejects operators invalid for the field type', () => {
    const dsl = {
      logic: 'AND',
      conditions: [{ field: 'last_order_at', op: 'gt', value: 5 }],
    };
    expect(segmentDslSchema.safeParse(dsl).success).toBe(false);
  });

  it('rejects negative spend and absurd day ranges', () => {
    expect(
      segmentDslSchema.safeParse({
        logic: 'AND',
        conditions: [{ field: 'total_spend', op: 'gt', value: -1 }],
      }).success,
    ).toBe(false);
    expect(
      segmentDslSchema.safeParse({
        logic: 'AND',
        conditions: [{ field: 'last_order_at', op: 'older_than_days', value: 99999 }],
      }).success,
    ).toBe(false);
  });

  it('caps condition count', () => {
    const dsl = {
      logic: 'OR',
      conditions: Array.from({ length: 11 }, () => ({
        field: 'order_count',
        op: 'gte',
        value: 1,
      })),
    };
    expect(segmentDslSchema.safeParse(dsl).success).toBe(false);
  });
});
