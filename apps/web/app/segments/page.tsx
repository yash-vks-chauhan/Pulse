import { Layers, Plus, Send, Sparkles, Target, Users } from 'lucide-react';
import Link from 'next/link';
import { BlurText } from '../../components/motion/blur-text';
import { SplitText } from '../../components/motion/split-text';
import {
  SegmentsExplorer,
  StartInCopilot,
  type Condition,
  type SegmentItem,
} from '../../components/segments-explorer';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { cn } from '../../lib/utils';

/**
 * Segments — server component. The CRM key stays server-side: we fetch the
 * saved audiences and, for each one, a *live* reach count from the preview
 * endpoint, so the page presents real audience sizes rather than abstract
 * rules. Composition over uniformity — an editorial masthead, a hairline
 * signal band, then a sortable reach-ranked ledger (the interactive client
 * explorer), never a grid of look-alike cards.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface Segment {
  id: string;
  name: string;
  dslJson: { logic: 'AND' | 'OR'; conditions: Condition[] };
  createdFrom: string;
  nlPrompt: string | null;
  createdAt: string;
  _count: { campaigns: number };
}

/** Match-all DSL — its preview count is the reachable customer base. */
const MATCH_ALL = {
  logic: 'AND' as const,
  conditions: [{ field: 'order_count', op: 'gte', value: 0 }],
};

async function fetchSegments(): Promise<Segment[] | null> {
  try {
    const response = await fetch(`${CRM_API_URL}/api/segments`, {
      headers: { 'x-api-key': process.env.PULSE_API_KEY ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Segment[];
  } catch {
    return null;
  }
}

/** Live audience size for one DSL; null on any failure so a row can degrade. */
async function fetchReach(dsl: unknown): Promise<number | null> {
  try {
    const response = await fetch(`${CRM_API_URL}/api/segments/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.PULSE_API_KEY ?? '',
      },
      body: JSON.stringify({ dsl, sample_size: 0 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { count?: number };
    return typeof data.count === 'number' ? data.count : null;
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

export default async function SegmentsPage() {
  const segments = await fetchSegments();

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
              <Users className="h-3.5 w-3.5" />
              {segments && segments.length > 0
                ? `${segments.length} saved ${segments.length === 1 ? 'audience' : 'audiences'} · live counts`
                : 'Audience builder'}
            </span>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              <SplitText text="Segments" delay={120} />
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Saved audiences with live reach. Every campaign snapshots one at launch — describe a
              new one in plain language and watch the count settle as you refine the rules.
            </p>
          </div>
          <Button asChild>
            <Link href="/copilot">
              <Plus />
              New segment
            </Link>
          </Button>
        </BlurText>
      </section>

      {segments === null && (
        <Alert variant="destructive">
          <AlertDescription>Could not reach the CRM API.</AlertDescription>
        </Alert>
      )}

      {segments !== null && segments.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="mt-4 font-medium">No segments yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Describe one in plain language in the Copilot — it becomes editable rules with a live
              count.
            </p>
            <div className="mt-5">
              <StartInCopilot />
            </div>
          </CardContent>
        </Card>
      )}

      {segments !== null && segments.length > 0 && (
        <SegmentsBody segments={segments} />
      )}
    </div>
  );
}

/** Enrichment + signal band + explorer, split out so the await chain is clear. */
async function SegmentsBody({ segments }: { segments: Segment[] }) {
  const [base, reaches] = await Promise.all([
    fetchReach(MATCH_ALL),
    Promise.all(segments.map((segment) => fetchReach(segment.dslJson))),
  ]);

  const items: SegmentItem[] = segments.map((segment, index) => ({
    id: segment.id,
    name: segment.name,
    dslJson: segment.dslJson,
    createdFrom: segment.createdFrom,
    nlPrompt: segment.nlPrompt,
    createdAt: segment.createdAt,
    // Format on the server with a fixed locale so the string is identical at
    // hydration (a client-side toLocaleDateString would use the browser locale).
    createdLabel: new Date(segment.createdAt).toLocaleDateString('en-US', {
      dateStyle: 'medium',
    }),
    campaigns: segment._count.campaigns,
    reach: reaches[index],
  }));

  const aiCount = items.filter((item) => item.createdFrom === 'nl').length;
  const manualCount = items.length - aiCount;
  const inUse = items.filter((item) => item.campaigns > 0).length;
  const largest = items.reduce(
    (top, item) => ((item.reach ?? -1) > (top.reach ?? -1) ? item : top),
    items[0],
  );
  const largestPct =
    base && base > 0 && largest.reach != null
      ? Math.round((largest.reach / base) * 100)
      : null;
  const aiPct = items.length > 0 ? (aiCount / items.length) * 100 : 0;

  return (
    <>
      {/* Signal band — asymmetric: a hero composition tile + three counts. */}
      <section>
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Audience signal
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            live counts from the seeded pipeline
          </p>
        </div>
        <div className="mt-4 grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1.05fr_2fr]">
          {/* hero: how many audiences, and how they were authored */}
          <div className="border-b p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="font-mono text-[11px] uppercase tracking-[0.1em]">
                Saved audiences
              </span>
            </div>
            <p className="mt-3 text-5xl font-semibold tracking-tight tabular-nums">
              {items.length}
            </p>
            <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="funnel-fill h-full bg-violet-500"
                style={{ ['--bar-w' as string]: `${aiPct}%`, ['--bar-delay' as string]: '150ms' }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                {aiCount} AI-authored
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                {manualCount} manual
              </span>
            </div>
          </div>
          {/* three supporting counts */}
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatTile
              icon={Send}
              label="In use"
              value={inUse.toLocaleString()}
              sub={inUse === 1 ? 'attached to a campaign' : 'attached to campaigns'}
            />
            <StatTile
              icon={Target}
              label="Largest reach"
              value={largest.reach != null ? largest.reach.toLocaleString() : '—'}
              sub={largestPct != null ? `${largest.name} · ${largestPct}% of base` : largest.name}
            />
            <StatTile
              icon={Sparkles}
              label="Reachable base"
              value={base != null ? base.toLocaleString() : '—'}
              sub="customers in the workspace"
            />
          </div>
        </div>
      </section>

      <SegmentsExplorer items={items} base={base} />
    </>
  );
}
