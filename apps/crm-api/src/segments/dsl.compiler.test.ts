import { segmentDslSchema, type SegmentDsl } from '@pulse/shared';
import { describe, expect, it } from 'vitest';
import { compileSegmentDsl } from './dsl.compiler';

const NOW = new Date('2026-06-13T12:00:00.000Z');

function compile(dsl: SegmentDsl) {
  // Mirror production: every document is schema-validated before compiling.
  return compileSegmentDsl(segmentDslSchema.parse(dsl), NOW);
}

describe('compileSegmentDsl', () => {
  it('compiles numeric operators onto whitelisted columns', () => {
    expect(
      compile({
        logic: 'AND',
        conditions: [
          { field: 'total_spend', op: 'gt', value: 2000 },
          { field: 'order_count', op: 'gte', value: 2 },
          { field: 'order_count', op: 'eq', value: 3 },
          { field: 'total_spend', op: 'neq', value: 0 },
        ],
      }),
    ).toEqual({
      AND: [
        { totalSpend: { gt: 2000 } },
        { orderCount: { gte: 2 } },
        { orderCount: { equals: 3 } },
        { totalSpend: { not: 0 } },
      ],
    });
  });

  it('compiles older_than_days on last_order_at to include never-ordered customers', () => {
    const result = compile({
      logic: 'AND',
      conditions: [{ field: 'last_order_at', op: 'older_than_days', value: 60 }],
    });
    const cutoff = new Date(NOW.getTime() - 60 * 86_400_000);
    expect(result).toEqual({
      AND: [{ OR: [{ lastOrderAt: { lt: cutoff } }, { lastOrderAt: null }] }],
    });
  });

  it('compiles within_days to a gte cutoff', () => {
    const result = compile({
      logic: 'AND',
      conditions: [{ field: 'last_order_at', op: 'within_days', value: 30 }],
    });
    const cutoff = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(result).toEqual({ AND: [{ lastOrderAt: { gte: cutoff } }] });
  });

  it('compiles created_at older_than_days without the null branch', () => {
    const result = compile({
      logic: 'AND',
      conditions: [{ field: 'created_at', op: 'older_than_days', value: 90 }],
    });
    const cutoff = new Date(NOW.getTime() - 90 * 86_400_000);
    expect(result).toEqual({ AND: [{ createdAt: { lt: cutoff } }] });
  });

  it('compiles city operators case-insensitively', () => {
    expect(
      compile({
        logic: 'OR',
        conditions: [
          { field: 'city', op: 'eq', value: 'Mumbai' },
          { field: 'city', op: 'neq', value: 'Delhi' },
          { field: 'city', op: 'contains', value: 'pur' },
        ],
      }),
    ).toEqual({
      OR: [
        { city: { equals: 'Mumbai', mode: 'insensitive' } },
        { city: { not: 'Delhi', mode: 'insensitive' } },
        { city: { contains: 'pur', mode: 'insensitive' } },
      ],
    });
  });

  it('compiles tags includes to an array membership filter', () => {
    expect(
      compile({ logic: 'AND', conditions: [{ field: 'tags', op: 'includes', value: 'vip' }] }),
    ).toEqual({ AND: [{ tags: { has: 'vip' } }] });
  });

  it('rejects non-whitelisted fields and operators at the schema boundary', () => {
    expect(
      segmentDslSchema.safeParse({
        logic: 'AND',
        conditions: [{ field: 'email_enc', op: 'eq', value: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      segmentDslSchema.safeParse({
        logic: 'AND',
        conditions: [{ field: 'city', op: 'regex', value: '.*' }],
      }).success,
    ).toBe(false);
    // SQL-ish payloads in values are inert (parameterized), but oversized ones are rejected.
    expect(
      segmentDslSchema.safeParse({
        logic: 'AND',
        conditions: [{ field: 'city', op: 'eq', value: "x'; DROP TABLE customers; --".repeat(10) }],
      }).success,
    ).toBe(false);
  });
});
