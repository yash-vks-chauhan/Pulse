'use client';

import {
  ArrowRight,
  ChevronRight,
  Code2,
  Database,
  FlaskConical,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { NumberTicker } from '@/components/motion/number-ticker';
import { SpotlightLink } from '@/components/motion/spotlight-link';
import { cn } from '@/lib/utils';

/**
 * Workspace explorer — the overview's centrepiece. A two-pane console: a left
 * index of every workspace destination and a large right "stage" that
 * crossfades to a bespoke, self-animating preview of whatever row you hover or
 * focus. Both panes link out, so it reads as a designed command center you can
 * actually steer — not a uniform grid of look-alike cards.
 *
 * The stage is desktop-only (hover is the interaction); on touch/small screens
 * the index collapses to a clean, navigable list where each row already states
 * its name, blurb, and live signal. Previews animate on mount via .rise-in /
 * .bar-grow, so every selection re-plays without any in-view plumbing.
 */

/* ------------------------------- previews -------------------------------- */
/* Each preview is a distinct instrument — never the same framed box twice. */

function cssVars(vars: Record<string, string | number>): React.CSSProperties {
  return vars as React.CSSProperties;
}

function CopilotPreview() {
  const rules = ['order count ≥ 2', 'last order > 60 days', 'total spend > ₹2,000'];
  return (
    <div className="flex h-full flex-col">
      <div className="rounded-lg border bg-background p-4">
        <p className="text-sm italic leading-relaxed text-muted-foreground">
          “shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000”
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rules.map((rule, index) => (
            <span
              key={rule}
              className="rise-in rounded-md bg-muted px-2 py-1 text-[11px]"
              style={cssVars({ '--rise-delay': `${150 + index * 90}ms` })}
            >
              {rule}
            </span>
          ))}
          <span
            className="rise-in rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent"
            style={cssVars({ '--rise-delay': '420ms' })}
          >
            match ALL
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">Live audience</span>
          <span className="text-sm font-semibold tabular-nums">
            <NumberTicker value={1284} /> customers
          </span>
        </div>
      </div>
      <div className="mt-3 rounded-lg border bg-background p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" /> Channel-aware draft, ready to edit
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['WhatsApp', 'SMS', 'Email', 'RCS'].map((channel) => (
            <span key={channel} className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {channel}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Plain language compiles into editable rules with a live match count, then a draft per
        channel. The AI proposes; you approve — nothing sends without you.
      </p>
    </div>
  );
}

function CampaignsPreview() {
  const funnel = [
    { label: 'Sent', value: '2,847', pct: 100, color: 'bg-foreground/70' },
    { label: 'Delivered', value: '2,591', pct: 91, color: 'bg-accent' },
    { label: 'Opened', value: '1,822', pct: 64, color: 'bg-violet-500' },
    { label: 'Clicked', value: '627', pct: 22, color: 'bg-success' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 rounded-lg border bg-background p-4">
        {funnel.map((row, index) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums">
                {row.value} <span className="text-muted-foreground">({row.pct}%)</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('bar-grow h-full rounded-full', row.color)}
                style={cssVars({ '--bar-w': `${row.pct}%`, '--bar-delay': `${index * 110}ms` })}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
          whatsapp ✗ stalled
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="rounded-md bg-success/10 px-2 py-1 font-medium text-success">
          sms ✓ delivered
        </span>
        <span className="text-muted-foreground">214 rescued by failover</span>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Sent → delivered → opened → clicked, derived from an append-only event log and refreshed
        every three seconds.
      </p>
    </div>
  );
}

function SegmentsPreview() {
  const segments = [
    { name: 'Lapsed VIPs', count: '1,284', pct: 100 },
    { name: 'First-time buyers, 30d', count: '842', pct: 66 },
    { name: 'High-value, quiet 60d', count: '613', pct: 48 },
    { name: 'New this week', count: '327', pct: 25 },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 rounded-lg border bg-background p-4">
        {segments.map((segment, index) => (
          <div key={segment.name} className="flex items-center gap-3">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="w-36 shrink-0 truncate text-xs sm:w-44">{segment.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="bar-grow h-full rounded-full bg-foreground/55"
                style={cssVars({ '--bar-w': `${segment.pct}%`, '--bar-delay': `${index * 110}ms` })}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums">
              {segment.count}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Every audience is a reusable, editable rule set — saved once, launched into as many
        campaigns as you like.
      </p>
    </div>
  );
}

function DataPreview() {
  return (
    <div className="flex h-full flex-col">
      <div className="rounded-lg border bg-background p-4 font-mono text-[11px] leading-relaxed">
        <p>
          <span className="text-success">POST</span>{' '}
          <span className="text-foreground/80">/api/ingest/customers</span>
        </p>
        <p className="mt-1 text-muted-foreground">
          {'{ "customers": [{ "external_id": "cust-1001", … }] }'}
        </p>
        <p className="mt-2 text-foreground/80">→ {'{ "upserted": 1 }'}</p>
        <p className="mt-3">
          <span className="text-accent">GET</span>{' '}
          <span className="text-foreground/80">/api/customers?segment=lapsed-vips</span>
        </p>
        <p className="mt-1 text-muted-foreground">→ 1,284 results · cursor-paginated</p>
        <p className="mt-2 text-muted-foreground/70">
          idempotent · batched · validated · PII encrypted at rest
        </p>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Bring your own data — drop a CSV or POST to the ingestion API. The same validation
        guards both paths.
      </p>
    </div>
  );
}

function ChaosPreview() {
  const rates = [
    { label: 'WhatsApp failure rate', pct: 40, color: 'bg-warning' },
    { label: 'SMS latency spike', pct: 18, color: 'bg-foreground/50' },
    { label: 'Email bounce rate', pct: 9, color: 'bg-foreground/40' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 rounded-lg border bg-background p-4">
        {rates.map((rate, index) => (
          <div key={rate.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{rate.label}</span>
              <span className="font-semibold tabular-nums">{rate.pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('bar-grow h-full rounded-full', rate.color)}
                style={cssVars({ '--bar-w': `${rate.pct}%`, '--bar-delay': `${index * 120}ms` })}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Crank real vendor failures mid-campaign and watch retries, the dead-letter queue, and
        channel failover keep reach high.
      </p>
    </div>
  );
}

function DocsPreview() {
  const endpoints = [
    { method: 'POST', path: '/api/ingest/customers', color: 'text-success' },
    { method: 'POST', path: '/api/segments/preview', color: 'text-success' },
    { method: 'GET', path: '/api/campaigns/:id/stats', color: 'text-accent' },
    { method: 'POST', path: '/api/campaigns/:id/launch', color: 'text-success' },
    { method: 'GET', path: '/api/customers', color: 'text-accent' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="divide-y rounded-lg border bg-background font-mono text-[11px]">
        {endpoints.map((endpoint) => (
          <div key={endpoint.path} className="flex items-center gap-3 px-4 py-2.5">
            <span className={cn('w-10 shrink-0 font-semibold', endpoint.color)}>
              {endpoint.method}
            </span>
            <span className="truncate text-foreground/80">{endpoint.path}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Everything the UI does, the API does too — batched ingestion, HMAC-signed webhooks with
        a replay window, and server-side validation.
      </p>
    </div>
  );
}

/* ----------------------------- destinations ------------------------------ */

type Destination = {
  key: string;
  href: string;
  name: string;
  blurb: string;
  signal: string;
  icon: React.ComponentType<{ className?: string }>;
  /** AI surfaces carry the violet accent, mirroring the rest of the app. */
  ai?: boolean;
  preview: React.ReactNode;
};

const DESTINATIONS: Destination[] = [
  {
    key: 'copilot',
    href: '/copilot',
    name: 'Copilot',
    blurb: 'Describe an audience in plain language',
    signal: 'AI',
    icon: Sparkles,
    ai: true,
    preview: <CopilotPreview />,
  },
  {
    key: 'campaigns',
    href: '/campaigns',
    name: 'Campaigns',
    blurb: 'Live delivery funnel with failover',
    signal: '1 live',
    icon: Send,
    preview: <CampaignsPreview />,
  },
  {
    key: 'segments',
    href: '/segments',
    name: 'Segments',
    blurb: 'Reusable audiences from rules',
    signal: 'saved',
    icon: Users,
    preview: <SegmentsPreview />,
  },
  {
    key: 'data',
    href: '/data',
    name: 'Data ingest',
    blurb: 'CSV upload or REST, encrypted at rest',
    signal: '23.7k rows',
    icon: Database,
    preview: <DataPreview />,
  },
  {
    key: 'simulator',
    href: '/simulator',
    name: 'Chaos panel',
    blurb: 'Crank vendor failures mid-send',
    signal: 'vendor sim',
    icon: FlaskConical,
    preview: <ChaosPreview />,
  },
  {
    key: 'docs',
    href: '/docs',
    name: 'API docs',
    blurb: 'Everything the UI does, the API does',
    signal: 'REST',
    icon: Code2,
    preview: <DocsPreview />,
  },
];

/* -------------------------------- explorer ------------------------------- */

export function WorkspaceExplorer() {
  const [activeKey, setActiveKey] = React.useState(DESTINATIONS[0].key);
  const active = DESTINATIONS.find((item) => item.key === activeKey) ?? DESTINATIONS[0];

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid lg:grid-cols-[320px_1fr]">
        {/* index ------------------------------------------------------------ */}
        <nav className="space-y-1 p-2 sm:p-3 lg:border-r">
          {DESTINATIONS.map((item) => {
            const isActive = item.key === active.key;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                onMouseEnter={() => setActiveKey(item.key)}
                onFocus={() => setActiveKey(item.key)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'bg-muted/70' : 'hover:bg-muted/40',
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                )}
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                    item.ai
                      ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                      : isActive
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-foreground/70',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1.5 py-px text-[10px] font-medium',
                        item.ai
                          ? 'border-transparent bg-violet-500/10 text-violet-600 dark:text-violet-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {item.signal}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {item.blurb}
                  </span>
                </span>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0 transition-all',
                    isActive
                      ? 'translate-x-0 text-foreground'
                      : '-translate-x-1 text-muted-foreground/40 group-hover:translate-x-0 group-hover:text-muted-foreground',
                  )}
                />
              </Link>
            );
          })}
        </nav>

        {/* stage (desktop) ------------------------------------------------- */}
        <SpotlightLink
          href={active.href}
          className="group relative hidden min-h-[420px] flex-col p-6 sm:p-7 lg:flex"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md',
                active.ai
                  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'bg-muted text-foreground/80',
              )}
            >
              <active.icon className="h-[18px] w-[18px]" />
            </span>
            <h3 className="text-base font-medium">{active.name}</h3>
            <span
              className={cn(
                'ml-auto shrink-0 rounded border px-1.5 py-px text-[10px] font-medium',
                active.ai
                  ? 'border-transparent bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'text-muted-foreground',
              )}
            >
              {active.signal}
            </span>
          </div>
          {/* key on the wrapper remounts the subtree so previews re-animate */}
          <div key={active.key} className="rise-in mt-5">
            {active.preview}
          </div>
          {/* footer pinned to the bottom so the pane stays balanced across the
              shorter and taller previews, and gives one clear call to action */}
          <div className="mt-auto flex items-center justify-end border-t pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
              Open {active.name}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </SpotlightLink>
      </div>
    </div>
  );
}
