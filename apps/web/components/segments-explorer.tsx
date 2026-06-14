'use client';

import { ArrowUpRight, Search, Send, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Segments explorer — the centrepiece of the Segments page. The server fetches
 * each saved audience together with its *live* reach (a real count from the
 * preview endpoint), then hands the enriched list here.
 *
 * Instead of a uniform grid of look-alike cards, this renders one scannable,
 * sortable ledger: every audience is a row whose reach bar is drawn to scale,
 * so the list reads as a ranked picture of who you can reach — editorial
 * hierarchy and real-data signal over decoration. A lightweight toolbar
 * (search · source · sort) keeps a long list organised without ceremony.
 */

export interface Condition {
  field: string;
  op: string;
  value: number | string;
}

export interface SegmentItem {
  id: string;
  name: string;
  dslJson: { logic: 'AND' | 'OR'; conditions: Condition[] };
  createdFrom: string;
  nlPrompt: string | null;
  /** ISO timestamp — used for sorting only (never rendered, to avoid a locale
   *  hydration mismatch; render `createdLabel` instead). */
  createdAt: string;
  /** Pre-formatted date string from the server, rendered as-is. */
  createdLabel: string;
  /** Campaigns that have snapshotted this audience. */
  campaigns: number;
  /** Live audience size from the preview endpoint; null if it couldn't load. */
  reach: number | null;
}

const OP_LABELS: Record<string, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  older_than_days: 'older than',
  within_days: 'within',
  contains: 'contains',
  includes: 'includes',
};

function conditionText(condition: Condition): string {
  const value =
    typeof condition.value === 'number' ? condition.value.toLocaleString() : condition.value;
  const suffix = condition.op.endsWith('_days') ? ' days' : '';
  const op = OP_LABELS[condition.op] ?? condition.op;
  return `${condition.field.replaceAll('_', ' ')} ${op} ${value}${suffix}`;
}

type SortKey = 'reach' | 'recent' | 'used' | 'name';
type SourceKey = 'all' | 'ai' | 'manual';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'reach', label: 'Largest reach' },
  { key: 'recent', label: 'Recently created' },
  { key: 'used', label: 'Most used' },
  { key: 'name', label: 'Name (A–Z)' },
];

const SOURCES: { key: SourceKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ai', label: 'AI' },
  { key: 'manual', label: 'Manual' },
];

const isAi = (item: SegmentItem) => item.createdFrom === 'nl';

export function SegmentsExplorer({
  items,
  base,
}: {
  items: SegmentItem[];
  base: number | null;
}) {
  const [query, setQuery] = React.useState('');
  const [source, setSource] = React.useState<SourceKey>('all');
  const [sort, setSort] = React.useState<SortKey>('reach');

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (source === 'ai' && !isAi(item)) return false;
      if (source === 'manual' && isAi(item)) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.nlPrompt?.toLowerCase().includes(needle) ?? false)
      );
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'reach':
          return (b.reach ?? -1) - (a.reach ?? -1);
        case 'used':
          return b.campaigns - a.campaigns || (b.reach ?? -1) - (a.reach ?? -1);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return sorted;
  }, [items, query, source, sort]);

  return (
    <section>
      {/* Toolbar ----------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search audiences by name or prompt…"
            aria-label="Search audiences"
            className="h-9 w-full rounded-lg border bg-card pl-9 pr-9 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
            {SOURCES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSource(option.key)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  source === option.key
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger className="h-9 w-[170px] shadow-sm" aria-label="Sort audiences">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {visible.length === items.length
          ? `${items.length} ${items.length === 1 ? 'audience' : 'audiences'}`
          : `${visible.length} of ${items.length} audiences`}
        {sort === 'reach' && visible.length > 1 && ' · ranked by live reach'}
      </p>

      {/* Ledger ------------------------------------------------------------ */}
      {visible.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center">
          <p className="font-medium">No audiences match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search or clear the source filter.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="divide-y">
            {visible.map((item, index) => (
              <SegmentRow key={item.id} item={item} base={base} index={index} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SegmentRow({
  item,
  base,
  index,
}: {
  item: SegmentItem;
  base: number | null;
  index: number;
}) {
  const ai = isAi(item);
  const pct =
    base && base > 0 && item.reach != null ? Math.min(100, (item.reach / base) * 100) : null;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };

  return (
    <div
      onMouseMove={handleMove}
      className="spotlight rise-in group relative grid gap-x-6 gap-y-4 px-5 py-5 transition-colors hover:bg-muted/30 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-6"
      style={{ ['--rise-delay' as string]: `${Math.min(index, 12) * 35}ms` }}
    >
      {/* Identity + rules */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 className="truncate text-[15px] font-medium">{item.name}</h3>
          {ai ? (
            <Badge variant="ai" className="px-1.5 py-0 text-[10px]">
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </Badge>
          ) : (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              Manual
            </Badge>
          )}
          {item.campaigns > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              In use
            </span>
          )}
        </div>

        {item.nlPrompt && (
          <p className="mt-1.5 truncate text-xs italic text-muted-foreground">
            “{item.nlPrompt}”
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-medium text-accent">
            match {item.dslJson.logic === 'AND' ? 'ALL' : 'ANY'}
          </span>
          {item.dslJson.conditions.map((condition, conditionIndex) => (
            <span
              key={conditionIndex}
              className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {conditionText(condition)}
            </span>
          ))}
        </div>
      </div>

      {/* Reach + meta */}
      <div className="lg:pl-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Live reach
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {item.reach != null ? item.reach.toLocaleString() : '—'}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {pct != null && (
            <div
              className="bar-grow h-full rounded-full bg-accent"
              style={{
                ['--bar-w' as string]: `${pct}%`,
                ['--bar-delay' as string]: `${200 + Math.min(index, 12) * 60}ms`,
              }}
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {pct != null ? `${pct.toFixed(pct < 10 ? 1 : 0)}% of base` : 'count unavailable'}
          </span>
          <span className="tabular-nums">
            {item.campaigns > 0
              ? `${item.campaigns} campaign${item.campaigns === 1 ? '' : 's'}`
              : 'unused'}
            {' · '}
            {item.createdLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Reusable CTA used by the page's empty state. */
export function StartInCopilot() {
  return (
    <Link
      href="/copilot"
      className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
    >
      <Send className="h-4 w-4" />
      Describe an audience
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}
