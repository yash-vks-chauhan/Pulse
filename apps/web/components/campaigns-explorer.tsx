'use client';

import { ChevronRight, Search, X } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Campaigns explorer — the interactive list on the Campaigns page. The server
 * fetches each campaign together with its live funnel, so every row can show a
 * real delivery bar (delivered ÷ attempts), turning the table into a scannable
 * picture of send health. A light toolbar (search · status · sort) keeps a
 * growing history organised; the table itself stays the focus.
 */

export type CampaignStatus = 'DRAFT' | 'RUNNING' | 'COMPLETED';

export interface CampaignItem {
  id: string;
  name: string;
  status: CampaignStatus;
  audience: number;
  /** ISO timestamp for sorting only (never rendered — avoids locale mismatch). */
  launchedAt: string | null;
  /** Pre-formatted launch date from the server, rendered as-is. */
  launchedLabel: string | null;
  createdAt: string;
  /** Live funnel figures; null when stats couldn't load. */
  total: number | null;
  delivered: number | null;
  deliveryRate: number | null;
}

const STATUS_VARIANT: Record<CampaignStatus, 'secondary' | 'accent' | 'success'> = {
  DRAFT: 'secondary',
  RUNNING: 'accent',
  COMPLETED: 'success',
};

type SortKey = 'recent' | 'delivery' | 'audience' | 'name';
type StatusFilter = 'all' | CampaignStatus;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently launched' },
  { key: 'delivery', label: 'Delivery rate' },
  { key: 'audience', label: 'Audience size' },
  { key: 'name', label: 'Name (A–Z)' },
];

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'RUNNING', label: 'Running' },
  { key: 'COMPLETED', label: 'Done' },
  { key: 'DRAFT', label: 'Draft' },
];

function launchedTime(item: CampaignItem): number {
  return item.launchedAt ? new Date(item.launchedAt).getTime() : new Date(item.createdAt).getTime();
}

export function CampaignsExplorer({ items }: { items: CampaignItem[] }) {
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [sort, setSort] = React.useState<SortKey>('recent');

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'delivery':
          return (b.deliveryRate ?? -1) - (a.deliveryRate ?? -1);
        case 'audience':
          return b.audience - a.audience;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
        default:
          return launchedTime(b) - launchedTime(a);
      }
    });
    return sorted;
  }, [items, query, status, sort]);

  return (
    <section>
      {/* Toolbar ----------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
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
            {STATUSES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatus(option.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  status === option.key
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger className="h-9 w-[180px] shadow-sm" aria-label="Sort campaigns">
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
          ? `${items.length} ${items.length === 1 ? 'campaign' : 'campaigns'}`
          : `${visible.length} of ${items.length} campaigns`}
      </p>

      {/* Table ------------------------------------------------------------- */}
      {visible.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center">
          <p className="font-medium">No campaigns match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search or clear the status filter.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Audience</TableHead>
                <TableHead className="w-[200px] text-right">Delivery</TableHead>
                <TableHead className="text-right">Launched</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell className="max-w-[280px]">
                    <Link
                      href={`/campaigns/${item.id}`}
                      className="font-medium transition-colors hover:text-accent"
                    >
                      <span className="block truncate">{item.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[item.status]}>
                      {item.status === 'RUNNING' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                      {item.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {item.audience > 0 ? item.audience.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    {item.deliveryRate != null ? (
                      <div className="flex items-center justify-end gap-2.5">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-success"
                            style={{ width: `${Math.min(100, item.deliveryRate)}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs font-medium tabular-nums">
                          {Math.round(item.deliveryRate)}%
                        </span>
                      </div>
                    ) : (
                      <p className="text-right text-muted-foreground">—</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {item.launchedLabel ?? '—'}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
