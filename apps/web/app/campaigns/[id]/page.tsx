'use client';

import {
  ArrowLeft,
  ArrowRight,
  GitBranch,
  ListOrdered,
  Rocket,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';

/**
 * Campaign detail — polls stats every 3s while the campaign is running and
 * renders the delivery funnel live. Insights (per-channel split, attributed
 * revenue, AI narrative, one-click follow-up) load once on demand — they can
 * cost an LLM call, so they are never polled. Everything goes through the
 * same-origin proxy; no key in the browser.
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

const FUNNEL_STEPS: Array<{ key: keyof Stats['funnel']; label: string; color: string }> = [
  { key: 'sent', label: 'Sent', color: 'bg-foreground/70' },
  { key: 'delivered', label: 'Delivered', color: 'bg-accent' },
  { key: 'engaged', label: 'Opened / read', color: 'bg-violet-500' },
  { key: 'clicked', label: 'Clicked', color: 'bg-success' },
];

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

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/campaigns/${params.id}/stats`, { cache: 'no-store' });
    if (!response.ok) {
      setError('Could not load campaign stats.');
      return;
    }
    setError(null);
    setStats((await response.json()) as Stats);
  }, [params.id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  async function launch() {
    setLaunching(true);
    const response = await fetch(`/api/campaigns/${params.id}/launch`, { method: 'POST' });
    setLaunching(false);
    if (response.ok) void load();
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
    } else {
      setInsightsError('Could not create the follow-up campaign.');
    }
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-4xl">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const base = Math.max(stats.total, 1);

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Campaigns
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {stats.campaign.name}
        </h1>
        <Badge variant={STATUS_VARIANT[stats.campaign.status]}>
          {stats.campaign.status === 'RUNNING' && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 [animation:ping-soft_1.6s_ease-out_infinite]" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          )}
          {stats.campaign.status.toLowerCase()}
        </Badge>
        {stats.campaign.status === 'DRAFT' && (
          <Button onClick={() => void launch()} disabled={launching} size="sm">
            <Rocket />
            {launching ? 'Launching…' : 'Launch'}
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {stats.campaign.audience_snapshot_count.toLocaleString()} customers in the snapshot
        {stats.campaign.launched_at &&
          ` · launched ${new Date(stats.campaign.launched_at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`}
        {stats.campaign.status === 'RUNNING' && ' · live, refreshing every 3s'}
      </p>

      {/* headline numbers */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroStat
          label="Delivered"
          value={`${pct(stats.funnel.delivered, base)}%`}
          sub={`${stats.funnel.delivered.toLocaleString()} of ${stats.total.toLocaleString()}`}
        />
        <HeroStat
          label="Opened / read"
          value={`${pct(stats.funnel.engaged, base)}%`}
          sub={stats.funnel.engaged.toLocaleString()}
        />
        <HeroStat
          label="Clicked"
          value={`${pct(stats.funnel.clicked, base)}%`}
          sub={stats.funnel.clicked.toLocaleString()}
        />
        <HeroStat
          label="Failed"
          value={stats.funnel.failed.toLocaleString()}
          sub={stats.funnel.queued > 0 ? `${stats.funnel.queued.toLocaleString()} queued` : 'none queued'}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Delivery funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {FUNNEL_STEPS.map((step) => {
              const value = stats.funnel[step.key];
              return (
                <div key={step.key}>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{step.label}</span>
                    <span className="tabular-nums">
                      {value.toLocaleString()} ({pct(value, base)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${step.color} transition-all duration-700`}
                      style={{ width: `${Math.min(100, (value / base) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Channel failover</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.failover.escalations === 0 ? (
              <p className="text-sm text-muted-foreground">No escalations (yet).</p>
            ) : (
              <p className="text-sm text-muted-foreground">
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
              {Object.entries(stats.status_counts)
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <div key={status} className="flex justify-between">
                    <span className="lowercase">{status}</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.campaign.status !== 'DRAFT' && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Insights</CardTitle>
            <Button onClick={() => void loadInsights()} disabled={insightsBusy} size="sm">
              <Sparkles />
              {insightsBusy ? 'Analyzing…' : insights ? 'Refresh insights' : 'Generate insights'}
            </Button>
          </CardHeader>
          <CardContent>
            {insightsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{insightsError}</AlertDescription>
              </Alert>
            )}

            {insightsBusy && (
              <div className="space-y-3" aria-live="polite">
                <p className="shimmer-text text-sm font-medium">
                  ✦ Reading the event log and writing the story…
                </p>
                <Skeleton className="h-20" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              </div>
            )}

            {!insights && !insightsBusy && !insightsError && (
              <p className="text-sm text-muted-foreground">
                Per-channel performance, attributed revenue, and an AI-written
                recommendation — generated on demand from the live event log.
              </p>
            )}

            {insights && !insightsBusy && (
              <div className="space-y-4">
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm leading-relaxed">
                  <p className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
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
                  <div className="rounded-lg bg-success/10 px-4 py-3.5">
                    <p className="text-xs text-success">
                      Attributed revenue ({insights.revenue.attribution_window_hours}h window)
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-success tabular-nums">
                      ₹{insights.revenue.attributed_revenue.toLocaleString('en-IN')}
                      <span className="ml-2 text-xs font-normal">
                        {insights.revenue.attributed_orders} orders
                      </span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-3.5">
                    <p className="text-xs text-muted-foreground">Reached but never engaged</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                      {insights.non_engaged_audience.toLocaleString()}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        customers
                      </span>
                    </p>
                  </div>
                </div>

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
                        <TableCell className="font-medium">{channel.channel}</TableCell>
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

                {insights.suggested_follow_up.estimated_audience > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
                    <p className="text-sm text-muted-foreground">
                      Follow up with the{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {insights.suggested_follow_up.estimated_audience.toLocaleString()} customers
                      </span>{' '}
                      who never engaged — via{' '}
                      <span className="font-semibold text-foreground">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
