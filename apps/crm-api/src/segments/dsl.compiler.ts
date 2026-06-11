import type { SegmentCondition, SegmentDsl } from '@pulse/shared';
import type { Prisma } from '@prisma/client';

/**
 * Segment DSL → Prisma query compiler.
 *
 * This is the ONLY path from a DSL document (LLM- or human-authored) to the
 * database. The document is zod-validated before it gets here, so every
 * field/op pair is whitelisted and every value is type- and range-checked;
 * this compiler maps them onto parameterized Prisma filters over a fixed set
 * of columns. No string interpolation, no raw SQL, no dynamic column names
 * from input.
 */

const DAY_MS = 86_400_000;

const NUMERIC_OP_TO_PRISMA = {
  eq: 'equals',
  neq: 'not',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
} as const;

const NUMERIC_FIELD_TO_COLUMN = {
  total_spend: 'totalSpend',
  order_count: 'orderCount',
} as const;

const DATE_FIELD_TO_COLUMN = {
  last_order_at: 'lastOrderAt',
  created_at: 'createdAt',
} as const;

function compileCondition(condition: SegmentCondition, now: Date): Prisma.CustomerWhereInput {
  switch (condition.field) {
    case 'total_spend':
    case 'order_count': {
      const column = NUMERIC_FIELD_TO_COLUMN[condition.field];
      const op = NUMERIC_OP_TO_PRISMA[condition.op];
      return { [column]: { [op]: condition.value } } as Prisma.CustomerWhereInput;
    }
    case 'last_order_at':
    case 'created_at': {
      const column = DATE_FIELD_TO_COLUMN[condition.field];
      const cutoff = new Date(now.getTime() - condition.value * DAY_MS);
      // older_than_days: the event happened before the cutoff (or, for
      // last_order_at, never happened at all — "no order in N days" must
      // include customers who have never ordered).
      if (condition.op === 'older_than_days') {
        const olderThan = { [column]: { lt: cutoff } } as Prisma.CustomerWhereInput;
        if (column === 'lastOrderAt') {
          return { OR: [olderThan, { lastOrderAt: null }] };
        }
        return olderThan;
      }
      return { [column]: { gte: cutoff } } as Prisma.CustomerWhereInput;
    }
    case 'city': {
      if (condition.op === 'eq') {
        return { city: { equals: condition.value, mode: 'insensitive' } };
      }
      if (condition.op === 'neq') {
        return { city: { not: condition.value, mode: 'insensitive' } };
      }
      return { city: { contains: condition.value, mode: 'insensitive' } };
    }
    case 'tags':
      return { tags: { has: condition.value } };
  }
}

export function compileSegmentDsl(dsl: SegmentDsl, now: Date = new Date()): Prisma.CustomerWhereInput {
  const compiled = dsl.conditions.map((condition) => compileCondition(condition, now));
  return dsl.logic === 'AND' ? { AND: compiled } : { OR: compiled };
}
