import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Database,
  FlaskConical,
  GitBranch,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { BlurText } from '../components/motion/blur-text';
import { CountUp } from '../components/motion/count-up';
import { NumberTicker } from '../components/motion/number-ticker';
import { Reveal } from '../components/motion/reveal';
import { SpotlightLink } from '../components/motion/spotlight-link';
import { SplitText } from '../components/motion/split-text';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

/**
 * Workspace overview — the first screen a signed-in reviewer sees, rendered
 * inside the sidebar shell. Not a second landing page: it orients you in the
 * (seeded) demo workspace, shows live system signal, and routes you into the
 * real screens. Composition over uniformity — an editorial masthead, a live
 * stat strip, and an asymmetric bento of real-screen previews — so it reads as
 * a designed command center rather than a stack of identical cards.
 *
 * The only live data dependency is the two service health checks below; the
 * showcased figures mirror the seeded demo workspace and stay in lockstep with
 * the public landing page.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';
const SIMULATOR_URL = process.env.SIMULATOR_URL ?? 'http://localhost:4100';

type Health = 'up' | 'down';

async function checkHealth(url: string): Promise<Health> {
  try {
    const response = await fetch(`${url}/healthz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/* -------------------------------- masthead -------------------------------- */

/** Compact, real-data service pill for the masthead status cluster. */
function ServicePill({ name, status }: { name: string; status: Health }) {
  const up = status === 'up';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-xs font-medium">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          up ? 'bg-success' : 'bg-destructive',
        )}
      />
      <span className="text-muted-foreground">{name}</span>
      <span className={up ? 'text-success' : 'text-destructive'}>
        {up ? 'up' : 'down'}
      </span>
    </span>
  );
}

/* ------------------------------ live stat strip --------------------------- */

const STATS: Array<{ value: number; suffix?: string; label: string }> = [
  { value: 5000, label: 'customers seeded' },
  { value: 23723, label: 'orders ingested' },
  { value: 98, suffix: '%', label: 'delivery rate' },
  { value: 214, label: 'rescued by failover' },
];

/* --------------------------------- bento ---------------------------------- */

/**
 * Animated funnel bar — the count rolls up (CountUp) and the bar grows from 0
 * when its Reveal parent scrolls into view, so the tile reads as a live chart.
 */
function FunnelBar({
  label,
  value,
  pct,
  color,
  delay,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
  delay: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          <CountUp value={value} />{' '}
          <span className="text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('funnel-fill h-full rounded-full', color)}
          style={{ ['--bar-w' as string]: `${pct}%`, ['--bar-delay' as string]: `${delay}ms` }}
        />
      </div>
    </div>
  );
}

/**
 * Supporting bento tile — a link to a real screen with an icon chip, caption,
 * and a miniature of what's inside. The whole tile is the link; the arrow and
 * border animate on hover. `accent` paints the chip violet for AI surfaces.
 */
function Tile({
  href,
  icon: Icon,
  title,
  caption,
  children,
  className,
  accent = false,
  delay = 0,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  caption: string;
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <Reveal className={cn('h-full', className)} delay={delay}>
      <SpotlightLink
        href={href}
        className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              accent
                ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                : 'bg-muted text-foreground/80 group-hover:bg-foreground group-hover:text-background',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="font-medium">{title}</h3>
          <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{caption}</p>
        <div className="mt-4 flex-1">{children}</div>
      </SpotlightLink>
    </Reveal>
  );
}

/* ------------------------------- the loop --------------------------------- */

const STEPS = [
  { step: '01', title: 'Describe', body: 'Plain language in — Pulse compiles it into validated, editable rules.' },
  { step: '02', title: 'Approve', body: 'See the live audience count before anything sends. You always approve.' },
  { step: '03', title: 'Execute', body: 'Queued dispatch with throttles, retries, and automatic channel failover.' },
  { step: '04', title: 'Learn', body: 'Attributed revenue and an AI-written next action — one click to follow up.' },
];

/* --------------------------------- page ----------------------------------- */

export async function OverviewDashboard() {
  const [crm, simulator] = await Promise.all([
    checkHealth(CRM_API_URL),
    checkHealth(SIMULATOR_URL),
  ]);

  return (
    <div className="space-y-14 sm:space-y-16">
      {/* Masthead ---------------------------------------------------------- */}
      <section className="relative isolate">
        {/* faint, masked dot grid behind the headline only */}
        <div
          aria-hidden
          className="bg-dot-grid mask-fade-edges pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 opacity-60"
        />
        <BlurText as="div" delay={0} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 [animation:ping-soft_1.8s_ease-out_infinite]" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Live workspace · seeded demo
          </span>
          <div className="flex items-center gap-2">
            <ServicePill name="CRM API" status={crm} />
            <ServicePill name="Simulator" status={simulator} />
          </div>
        </BlurText>

        <h1 className="mt-6 max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
          <SplitText text="Welcome to your" delay={120} />{' '}
          <span
            className="split-word font-editorial font-normal text-foreground/90"
            style={{ ['--word-delay' as string]: '330ms' }}
          >
            workspace.
          </span>
        </h1>
        <BlurText delay={500} className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Pre-seeded with 5,000 customers and a finished campaign, so every screen below is
          live and explorable right now. Start in the Copilot, or jump straight to a campaign.
        </BlurText>

        <BlurText as="div" delay={650} className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/copilot">
              <Sparkles />
              Open the Copilot
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/campaigns">
              Browse campaigns
              <ArrowRight />
            </Link>
          </Button>
        </BlurText>
      </section>

      {/* Live stat strip --------------------------------------------------- */}
      <Reveal>
        <div className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-card lg:grid-cols-4 lg:divide-y-0">
          {STATS.map((stat) => (
            <div key={stat.label} className="px-5 py-6">
              <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                <CountUp value={stat.value} suffix={stat.suffix ?? ''} />
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Bento showcase ---------------------------------------------------- */}
      <section>
        <Reveal>
          <h2 className="text-lg font-semibold tracking-tight">Explore the workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each tile is a real screen — pre-seeded and ready. Open one to see it run.
          </p>
        </Reveal>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Copilot — the flagship, wide hero tile */}
          <Reveal className="h-full sm:col-span-2" delay={60}>
            <SpotlightLink
              href="/copilot"
              className="group flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Sparkles className="h-[18px] w-[18px]" />
                </span>
                <h3 className="text-base font-medium">Copilot</h3>
                <Badge variant="ai" className="px-2 text-[10px]">
                  language in, audience out
                </Badge>
                <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div className="mt-5 rounded-lg border bg-background p-4">
                <p className="text-sm italic leading-relaxed text-muted-foreground">
                  “shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000”
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    'order count ≥ 2',
                    'last order > 60 days',
                    'total spend > ₹2,000',
                  ].map((rule, index) => (
                    <span
                      key={rule}
                      className="rise-in rounded-md bg-muted px-2 py-1 text-[11px]"
                      style={{ ['--rise-delay' as string]: `${300 + index * 90}ms` }}
                    >
                      {rule}
                    </span>
                  ))}
                  <span
                    className="rise-in rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent"
                    style={{ ['--rise-delay' as string]: '570ms' }}
                  >
                    match ALL
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium tabular-nums">
                  <NumberTicker value={1284} /> customers match
                </p>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                The AI compiles your words into editable rules with a live match count — it
                proposes, you approve. Nothing opaque, nothing sent without you.
              </p>
            </SpotlightLink>
          </Reveal>

          {/* Live delivery funnel */}
          <Tile
            href="/campaigns"
            icon={Activity}
            title="Live delivery funnel"
            caption="Refreshes every 3s from the append-only event log."
            delay={120}
          >
            <div className="flex h-full flex-col justify-center space-y-2.5 rounded-lg border bg-background p-4">
              <FunnelBar label="Sent" value={2847} pct={100} color="bg-foreground/70" delay={100} />
              <FunnelBar label="Delivered" value={2591} pct={91} color="bg-accent" delay={220} />
              <FunnelBar label="Opened" value={1822} pct={64} color="bg-violet-500" delay={340} />
              <FunnelBar label="Clicked" value={627} pct={22} color="bg-success" delay={460} />
            </div>
          </Tile>

          {/* Channel failover */}
          <Tile
            href="/campaigns"
            icon={GitBranch}
            title="Automatic failover"
            caption="A channel hard-fails and Pulse escalates to the next."
            delay={180}
          >
            <div className="h-full rounded-lg border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                  whatsapp ✗ failed
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="rounded-md bg-success/10 px-2 py-1 font-medium text-success">
                  sms ✓ delivered
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">214 customers rescued</span> via SMS
                after their primary channel failed.
              </p>
            </div>
          </Tile>

          {/* Chaos panel */}
          <Tile
            href="/simulator"
            icon={FlaskConical}
            title="Chaos panel"
            caption="Crank vendor failures mid-campaign and watch it absorb them."
            delay={240}
          >
            <div className="h-full rounded-lg border bg-background p-4 text-[11px] text-muted-foreground">
              <div className="flex justify-between">
                <span>WhatsApp failure rate</span>
                <span className="font-semibold text-foreground tabular-nums">40%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[40%] rounded-full bg-warning" />
              </div>
              <p className="mt-3 leading-relaxed">
                Retries, the dead-letter queue, and failover keep reach high — duplicates and
                out-of-order callbacks included.
              </p>
            </div>
          </Tile>

          {/* Bring your own data */}
          <Tile
            href="/data"
            icon={Database}
            title="Bring your own data"
            caption="Upload CSV or POST to the ingestion API — PII encrypted at rest."
            delay={300}
          >
            <div className="h-full rounded-lg border bg-background p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <span className="text-success">POST</span> /api/ingest/customers
              </p>
              <p className="mt-1 text-foreground/80">→ {'{'} &quot;upserted&quot;: 1 {'}'}</p>
              <p className="mt-2 text-muted-foreground/70">idempotent · batched · validated</p>
            </div>
          </Tile>
        </div>
      </section>

      {/* The loop ---------------------------------------------------------- */}
      <section>
        <Reveal>
          <h2 className="text-lg font-semibold tracking-tight">How a campaign moves</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The AI proposes at every step — it never acts without you.
          </p>
        </Reveal>
        <Reveal delay={80} className="mt-5">
          <div className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-card lg:grid-cols-4 lg:divide-y-0">
            {STEPS.map((item) => (
              <div key={item.step} className="p-5">
                <span className="font-mono text-xs text-muted-foreground">{item.step}</span>
                <h4 className="mt-2 font-medium">{item.title}</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>
    </div>
  );
}
