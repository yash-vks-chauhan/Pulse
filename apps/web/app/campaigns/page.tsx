import { CheckCircle2, Layers, Plus, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import {
  CampaignsExplorer,
  type CampaignItem,
  type CampaignStatus,
} from '../../components/campaigns-explorer';
import { BlurText } from '../../components/motion/blur-text';
import { SplitText } from '../../components/motion/split-text';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { cn } from '../../lib/utils';

/**
 * Campaign list — server component. Fetches the CRM API directly with the
 * server-held key (nothing sensitive reaches the browser), then enriches each
 * campaign with its live funnel so the list can show a real delivery bar per
 * row. Composition over uniformity: an editorial masthead, a hairline signal
 * band, and an interactive delivery-aware table.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  audienceSnapshotCount: number;
  launchedAt: string | null;
  createdAt: string;
}

interface CampaignStats {
  total: number;
  funnel: { delivered: number };
}

async function fetchCampaigns(): Promise<Campaign[] | null> {
  try {
    const response = await fetch(`${CRM_API_URL}/api/campaigns`, {
      headers: { 'x-api-key': process.env.PULSE_API_KEY ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Campaign[];
  } catch {
    return null;
  }
}

/** Live funnel for one campaign; null on any failure so a row can degrade. */
async function fetchStats(id: string): Promise<CampaignStats | null> {
  try {
    const response = await fetch(`${CRM_API_URL}/api/campaigns/${id}/stats`, {
      headers: { 'x-api-key': process.env.PULSE_API_KEY ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return (await response.json()) as CampaignStats;
  } catch {
    return null;
  }
}

/* ------------------------------ signal band ------------------------------- */

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={cn('p-5 lg:p-6', className)}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="font-mono text-[11px] uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export default async function CampaignsPage() {
  const campaigns = await fetchCampaigns();

  return (
    <div className="space-y-10 sm:space-y-12">
      {/* Masthead ---------------------------------------------------------- */}
      <section>
        <BlurText
          as="div"
          delay={0}
          className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
        >
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Send className="h-3.5 w-3.5" />
              {campaigns && campaigns.length > 0
                ? `${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'} · live delivery`
                : 'Campaign console'}
            </span>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              <SplitText text="Campaigns" delay={120} />
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Every send, live and historical. Delivery rates derive from an append-only event log —
              open any campaign for the live funnel, channel split, and an AI-written next action.
            </p>
          </div>
          <Button asChild>
            <Link href="/copilot">
              <Plus />
              New campaign
            </Link>
          </Button>
        </BlurText>
      </section>

      {campaigns === null && (
        <Alert variant="destructive">
          <AlertDescription>Could not reach the CRM API.</AlertDescription>
        </Alert>
      )}

      {campaigns !== null && campaigns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Send className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="mt-4 font-medium">No campaigns yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Describe an audience in the Copilot and launch your first campaign in under a minute.
            </p>
            <Button asChild className="mt-5">
              <Link href="/copilot">Start in the Copilot</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {campaigns !== null && campaigns.length > 0 && (
        <CampaignsBody campaigns={campaigns} />
      )}
    </div>
  );
}

/** Enrichment + signal band + explorer, split out so the await chain is clear. */
async function CampaignsBody({ campaigns }: { campaigns: Campaign[] }) {
  const statsList = await Promise.all(campaigns.map((campaign) => fetchStats(campaign.id)));

  const items: CampaignItem[] = campaigns.map((campaign, index) => {
    const stats = statsList[index];
    const total = stats?.total ?? null;
    const delivered = stats?.funnel.delivered ?? null;
    const deliveryRate =
      total && total > 0 && delivered != null ? (delivered / total) * 100 : null;
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      audience: campaign.audienceSnapshotCount,
      launchedAt: campaign.launchedAt,
      launchedLabel: campaign.launchedAt
        ? new Date(campaign.launchedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })
        : null,
      createdAt: campaign.createdAt,
      total,
      delivered,
      deliveryRate,
    };
  });

  const running = items.filter((item) => item.status === 'RUNNING').length;
  const totalDelivered = items.reduce((sum, item) => sum + (item.delivered ?? 0), 0);
  const totalAttempts = items.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const avgDelivery = totalAttempts > 0 ? Math.round((totalDelivered / totalAttempts) * 100) : null;

  return (
    <>
      {/* Signal band — delivery-rate hero + three supporting counts. */}
      <section>
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Delivery signal
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            aggregated from the live event log
          </p>
        </div>
        <div className="mt-4 grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1.05fr_2fr]">
          <div className="border-b p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-mono text-[11px] uppercase tracking-[0.1em]">
                Avg delivery rate
              </span>
            </div>
            <p className="mt-3 text-5xl font-semibold tracking-tight tabular-nums">
              {avgDelivery != null ? `${avgDelivery}%` : '—'}
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${avgDelivery ?? 0}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground tabular-nums">
              {totalDelivered.toLocaleString()} delivered across {totalAttempts.toLocaleString()}{' '}
              attempts — retries and channel failover absorb vendor failures.
            </p>
          </div>
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatTile
              icon={Layers}
              label="Campaigns"
              value={items.length.toLocaleString()}
              sub={`${items.length - running} completed or draft`}
            />
            <StatTile
              icon={Send}
              label="Running now"
              value={running.toLocaleString()}
              sub={running === 0 ? 'nothing in flight' : 'dispatching live'}
            />
            <StatTile
              icon={Sparkles}
              label="Messages delivered"
              value={totalDelivered.toLocaleString()}
              sub="reached after retries"
            />
          </div>
        </div>
      </section>

      <CampaignsExplorer items={items} />
    </>
  );
}
