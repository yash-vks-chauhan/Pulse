'use client';

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChartPie,
  CheckCircle2,
  Eye,
  GitBranch,
  Loader2,
  MousePointerClick,
  Rocket,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ChannelBarChart,
  DeliveryAreaChart,
  StatusDonut,
  type TimelinePoint,
} from '../../../components/campaign-charts';
import { DeliveryFunnel, funnelStages } from '../../../components/delivery-funnel';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Skeleton } from '../../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { cn } from '../../../lib/utils';

/**
 * Campaign detail — polls stats (and, while running, the delivery timeline)
 * every 3s. Insights (per-channel split, attributed revenue, AI narrative,
 * one-click follow-up) load once on demand — they can cost an LLM call, so they
 * are never polled. Everything goes through the same-origin proxy; no key in
 * the browser.
 *
 * Chart-driven, fluid layout (no centred column): an editorial header whose
 * primary action triggers and scrolls to insights; a performance card pairing
 * the headline KPIs with a real "delivery over time" area chart; a status
 * donut and failover beside it; then on-demand insights with a per-channel bar
 * chart. Charts are recharts via the shadcn <ChartContainer>, themed from the
 * app's tokens. Every series is real data from the event log.
 */

interface Stats {
  campaign: {
    id: string;
    name: string;
    status: 'DRAFT' | 'RUNNING' | 'COMPLETED';
    audience_snapshot_count: number;
    launched_at: string | null;
  };
  total: number;
  status_counts: Record<string, number>;
  event_counts: Record<string, number>;
  funnel: {
    queued: number;
    sent: number;
    delivered: number;
    engaged: number;
    clicked: number;
    failed: number;
  };
  failover: { escalations: number; rescued: number };
}

interface Timeline {
  total: number;
  buckets: TimelinePoint[];
}

interface Insights {
  channels: Array<{
    channel: string;
    attempted: number;
    delivered: number;
    engaged: number;
    clicked: number;
    converted: number;
    failed: number;
    delivery_rate: number;
  }>;
  revenue: {
    attributed_orders: number;
    attributed_revenue: number;
    attribution_window_hours: number;
  };
  non_engaged_audience: number;
  narrative: { source: 'ai' | 'heuristic'; summary: string; recommendation: string };
  suggested_follow_up: { channel: string; objective: string; estimated_audience: number };
}

const STATUS_VARIANT: Record<
  Stats['campaign']['status'],
  'secondary' | 'accent' | 'success'
> = {
  DRAFT: 'secondary',
  RUNNING: 'accent',
  COMPLETED: 'success',
};

function pct(value: number, base: number): number {
  return Math.round((value / Math.max(base, 1)) * 100);
}

/* ------------------------------ small pieces ------------------------------ */

/** One cell of the headline KPI strip — matches the app's signal-band style
 *  (mono-uppercase label + icon, big tabular number, muted sub). Dividers come
 *  from the parent so the strip reads as one cohesive bar. */
function KpiCell({
  icon: Icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn('p-5 lg:p-6', className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-2.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}

/** Framed panel matching the app's card surface, with an optional header slot. */
function Panel({
  id,
  title,
  icon: Icon,
  right,
  children,
  className,
}: {
  id?: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-20 rounded-xl border bg-card p-5 shadow-sm sm:p-6', className)}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [deliveryView, setDeliveryView] = useState<'funnel' | 'trend'>('funnel');

  const load = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${params.id}/stats`, { cache: 'no-store' });
    if (!response.ok) {
      setError('Could not load campaign stats.');
      return;
    }
    setError(null);
    setStats((await response.json()) as Stats);
  }, [params.id]);

  const loadTimeline = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${params.id}/timeline`, { cache: 'no-store' });
    if (response.ok) setTimeline((await response.json()) as Timeline);
  }, [params.id]);

  useEffect(() => {
    void load();
    void loadTimeline();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load, loadTimeline]);

  // Keep the delivery curve live only while the campaign is actually running.
  const running = stats?.campaign.status === 'RUNNING';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void loadTimeline(), 3000);
    return () => clearInterval(timer);
  }, [running, loadTimeline]);

  async function launch() {
    setLaunching(true);
    const response = await fetch(`/api/campaigns/${params.id}/launch`, { method: 'POST' });
    setLaunching(false);
    if (response.ok) {
      void load();
      void loadTimeline();
    }
  }

  async function loadInsights() {
    setInsightsBusy(true);
    setInsightsError(null);
    const response = await fetch(`/api/insights/${params.id}`, { cache: 'no-store' });
    setInsightsBusy(false);
    if (!response.ok) {
      setInsightsError('Could not load insights.');
      return;
    }
    setInsights((await response.json()) as Insights);
  }

  /** Trigger insights and bring the panel into view — the header's lift action. */
  function openInsights() {
    document.getElementById('insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void loadInsights();
  }

  async function createFollowUp() {
    setFollowUpBusy(true);
    const response = await fetch(`/api/insights/${params.id}/follow-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    setFollowUpBusy(false);
    if (response.ok) {
      const campaign = (await response.json()) as { id: string };
      router.push(`/campaigns/${campaign.id}`);
      setInsights(null);
      setStats(null);
      setTimeline(null);
    } else {
      setInsightsError('Could not create the follow-up campaign.');
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const { campaign, funnel, total } = stats;
  const base = Math.max(total, 1);
  const isDraft = campaign.status === 'DRAFT';
  const hasTimeline = (timeline?.buckets.length ?? 0) > 0;

  return (
    <div className="space-y-4 pb-16">
      {/* Header ------------------------------------------------------------ */}
      <header className="mb-2">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{campaign.name}</h1>
          <Badge variant={STATUS_VARIANT[campaign.status]}>
            {campaign.status === 'RUNNING' && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 [animation:ping-soft_1.6s_ease-out_infinite]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            )}
            {campaign.status.toLowerCase()}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            {isDraft ? (
              <Button onClick={() => void launch()} disabled={launching} size="sm">
                <Rocket />
                {launching ? 'Launching…' : 'Launch'}
              </Button>
            ) : (
              <Button onClick={openInsights} disabled={insightsBusy} size="sm">
                <Sparkles />
                {insightsBusy ? 'Analyzing…' : insights ? 'Refresh insights' : 'Generate insights'}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {campaign.audience_snapshot_count.toLocaleString()} customers in the snapshot
          {campaign.launched_at &&
            ` · launched ${new Date(campaign.launched_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}`}
          {campaign.status === 'RUNNING' && ' · live, refreshing every 3s'}
        </p>
      </header>

      {isDraft ? (
        /* Draft — nothing has sent yet, so lead with the launch action. */
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Rocket className="h-5 w-5 text-muted-foreground" />
          </span>
          <p className="mt-4 font-medium">This campaign hasn’t launched yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {campaign.audience_snapshot_count.toLocaleString()} customers are in the snapshot. Launch
            to start dispatch — the delivery charts fill here in real time.
          </p>
          <Button onClick={() => void launch()} disabled={launching} className="mt-5">
            <Rocket />
            {launching ? 'Launching…' : 'Launch campaign'}
          </Button>
        </section>
      ) : (
        <>
          {/* Headline KPI strip — the app's signal-band treatment. */}
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-sm sm:grid-cols-4">
            <KpiCell
              icon={CheckCircle2}
              label="Delivery rate"
              value={`${pct(funnel.delivered, base)}%`}
              sub={`${funnel.delivered.toLocaleString()} of ${total.toLocaleString()}`}
            />
            <KpiCell
              icon={Eye}
              label="Opened / read"
              value={`${pct(funnel.engaged, base)}%`}
              sub={funnel.engaged.toLocaleString()}
              className="border-l"
            />
            <KpiCell
              icon={MousePointerClick}
              label="Clicked"
              value={`${pct(funnel.clicked, base)}%`}
              sub={funnel.clicked.toLocaleString()}
              className="border-t sm:border-l sm:border-t-0"
            />
            <KpiCell
              icon={XCircle}
              label="Failed"
              value={funnel.failed.toLocaleString()}
              sub={
                stats.failover.rescued > 0
                  ? `${stats.failover.rescued.toLocaleString()} rescued by failover`
                  : funnel.queued > 0
                    ? `${funnel.queued.toLocaleString()} still queued`
                    : 'none rescued'
              }
              className="border-l border-t sm:border-t-0"
            />
          </div>

          {/* Charts — delivery (switchable) beside the status mix + failover. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="flex flex-col lg:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Delivery
                </h2>
                <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
                  {(
                    [
                      ['funnel', 'Funnel'],
                      ['trend', 'Over time'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDeliveryView(key)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        deliveryView === key
                          ? 'bg-foreground text-background shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex min-h-[280px] flex-1 items-center justify-center">
                {deliveryView === 'funnel' ? (
                  <DeliveryFunnel
                    stages={funnelStages(funnel)}
                    total={total}
                    variant="live"
                    className="w-full"
                  />
                ) : hasTimeline ? (
                  <DeliveryAreaChart data={timeline!.buckets} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {running ? 'Waiting for the first delivery events…' : 'No delivery events yet.'}
                  </p>
                )}
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel title="Status breakdown" icon={ChartPie}>
                <StatusDonut statusCounts={stats.status_counts} />
              </Panel>
              <Panel title="Channel failover" icon={GitBranch}>
                {stats.failover.escalations === 0 ? (
                  <p className="text-sm text-muted-foreground">No escalations (yet).</p>
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">
                      {stats.failover.escalations.toLocaleString()}
                    </span>{' '}
                    messages escalated to a fallback channel —{' '}
                    <span className="font-semibold text-success tabular-nums">
                      {stats.failover.rescued.toLocaleString()}
                    </span>{' '}
                    customers rescued (reached after the primary channel failed).
                  </p>
                )}
              </Panel>
            </div>
          </div>

          {/* Insights — on demand. */}
          <Panel
            id="insights"
            title="Insights"
            icon={Sparkles}
            right={
              <Button onClick={() => void loadInsights()} disabled={insightsBusy} size="sm">
                <Sparkles />
                {insightsBusy ? 'Analyzing…' : insights ? 'Refresh insights' : 'Generate insights'}
              </Button>
            }
          >
            {insightsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{insightsError}</AlertDescription>
              </Alert>
            )}

            {insightsBusy && (
              <div className="space-y-3" aria-live="polite">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading the event log and writing the story…
                </p>
                <Skeleton className="h-20" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              </div>
            )}

            {!insights && !insightsBusy && !insightsError && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Per-channel performance, attributed revenue, and an AI-written recommendation —
                generated on demand from the live event log.
              </p>
            )}

            {insights && !insightsBusy && (
              <div className="space-y-5">
                <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                  <p className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="font-semibold">
                        {insights.narrative.source === 'ai' ? 'Copilot' : 'Summary'}:
                      </span>{' '}
                      {insights.narrative.summary}
                    </span>
                  </p>
                  <p className="mt-2 pl-6">
                    <span className="font-semibold">Next:</span>{' '}
                    {insights.narrative.recommendation}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-lg bg-success/10 px-4 py-3.5">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    <div>
                      <p className="text-xs text-success">
                        Attributed revenue ({insights.revenue.attribution_window_hours}h window)
                      </p>
                      <p className="mt-0.5 text-2xl font-semibold tracking-tight text-success tabular-nums">
                        ₹{insights.revenue.attributed_revenue.toLocaleString('en-IN')}
                        <span className="ml-2 text-xs font-normal">
                          {insights.revenue.attributed_orders} orders
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3.5">
                    <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Reached but never engaged</p>
                      <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
                        {insights.non_engaged_audience.toLocaleString()}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          customers
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Per-channel performance — bar chart + exact figures. */}
                <div className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Per-channel performance</h3>
                  </div>
                  <ChannelBarChart channels={insights.channels} />
                  <div className="mt-4 overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Channel</TableHead>
                          <TableHead className="text-right">Attempted</TableHead>
                          <TableHead className="text-right">Delivered</TableHead>
                          <TableHead className="text-right">Engaged</TableHead>
                          <TableHead className="text-right">Clicked</TableHead>
                          <TableHead className="text-right">Converted</TableHead>
                          <TableHead className="text-right">Delivery rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {insights.channels.map((channel) => (
                          <TableRow key={channel.channel}>
                            <TableCell className="font-medium capitalize">
                              {channel.channel}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {channel.attempted.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {channel.delivered.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {channel.engaged.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {channel.clicked.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {channel.converted.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {channel.delivery_rate}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {insights.suggested_follow_up.estimated_audience > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">
                      Follow up with the{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {insights.suggested_follow_up.estimated_audience.toLocaleString()} customers
                      </span>{' '}
                      who never engaged — via{' '}
                      <span className="font-semibold capitalize text-foreground">
                        {insights.suggested_follow_up.channel}
                      </span>
                      .
                    </p>
                    <Button onClick={() => void createFollowUp()} disabled={followUpBusy}>
                      {followUpBusy ? 'Creating…' : 'Create follow-up campaign'}
                      <ArrowRight />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
