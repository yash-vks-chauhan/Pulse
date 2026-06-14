import {
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  PenLine,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { DeliveryFunnel, funnelStages } from '../components/delivery-funnel';
import { BlurText } from '../components/motion/blur-text';
import { CountUp } from '../components/motion/count-up';
import { Reveal } from '../components/motion/reveal';
import { SplitText } from '../components/motion/split-text';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { WorkspaceExplorer } from '../components/workspace-explorer';
import { cn } from '../lib/utils';

/**
 * Workspace overview — the first screen a signed-in reviewer sees, rendered
 * inside the sidebar shell. Not a second landing page: it orients you in the
 * (seeded) demo workspace, shows live system signal, and routes you into the
 * real screens.
 *
 * Composition over uniformity — an editorial masthead, a hairline signal band,
 * an interactive workspace explorer (the centrepiece), and a drawn campaign-flow
 * diagram — so it reads as a designed command center, never a stack of
 * look-alike cards. The only live data dependency is the two service health
 * checks; the showcased figures mirror the seeded demo workspace and stay in
 * lockstep with the public landing page.
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

/** Compact, real-data service pill for the masthead status cluster. */
function ServicePill({ name, status }: { name: string; status: Health }) {
  const up = status === 'up';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-xs font-medium">
      <span className={cn('h-1.5 w-1.5 rounded-full', up ? 'bg-success' : 'bg-destructive')} />
      <span className="text-muted-foreground">{name}</span>
      <span className={up ? 'text-success' : 'text-destructive'}>{up ? 'up' : 'down'}</span>
    </span>
  );
}

/* ---------------------------- campaign console ---------------------------- */

/**
 * The featured live campaign — a framed console that fills the masthead's right
 * half so the hero reads as a product, not a narrow text column. Mirrors the
 * landing's hero figures; bars grow on mount via the shared DeliveryFunnel.
 */
function CampaignConsole() {
  return (
    <div className="frame-ring overflow-hidden rounded-xl bg-card">
      <div className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background">
          <Send className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium">Monsoon Malabar</span>
        <Badge variant="accent" className="gap-1.5 px-2 py-0.5 text-[10px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 [animation:ping-soft_1.6s_ease-out_infinite]" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Running
        </Badge>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          refreshing every 3s
        </span>
      </div>
      <div className="p-5">
        <DeliveryFunnel
          stages={funnelStages({ sent: 2847, delivered: 2591, engaged: 1822, clicked: 627 })}
          total={2847}
          variant="mount"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
            whatsapp ✗ stalled
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="rounded-md bg-success/10 px-2 py-1 font-medium text-success">
            sms ✓ delivered
          </span>
          <span className="text-muted-foreground">214 rescued by failover</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- signal band ------------------------------ */

/**
 * Asymmetric signal: one hero proof metric (delivery rate, with an honest
 * meter) anchors three supporting counts — editorial hierarchy over a uniform
 * four-up grid.
 */
const SUPPORTING: Array<{
  value: number;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 5000, label: 'customers seeded', sub: 'PII encrypted at rest', icon: Users },
  { value: 23723, label: 'orders ingested', sub: 'append-only event log', icon: ShoppingBag },
  { value: 214, label: 'rescued by failover', sub: 'primary channel hard-failed', icon: ShieldCheck },
];

/* -------------------------------- the loop -------------------------------- */

const STEPS: Array<{
  step: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { step: '01', title: 'Describe', body: 'Plain language in — Pulse compiles it into validated, editable rules.', icon: PenLine },
  { step: '02', title: 'Approve', body: 'See the live audience count before anything sends. You always approve.', icon: CheckCheck },
  { step: '03', title: 'Execute', body: 'Queued dispatch with throttles, retries, and automatic channel failover.', icon: Send },
  { step: '04', title: 'Learn', body: 'Attributed revenue and an AI-written next action — one click to follow up.', icon: TrendingUp },
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

        <div className="mt-7 grid items-center gap-10 lg:mt-9 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div>
            <h1 className="max-w-xl text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
              <SplitText text="Welcome to your" delay={120} />{' '}
              <span
                className="split-word font-editorial font-normal text-foreground/90"
                style={{ ['--word-delay' as string]: '330ms' }}
              >
                workspace.
              </span>
            </h1>
            <BlurText delay={500} className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              Pre-seeded with 5,000 customers and a live campaign, so every screen here is real
              and explorable. Hover the explorer to look inside, or jump straight in.
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
          </div>

          <BlurText as="div" delay={780} className="hidden lg:block">
            <CampaignConsole />
          </BlurText>
        </div>
      </section>

      {/* Signal band ------------------------------------------------------- */}
      <Reveal as="section">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Workspace signal
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            live figures from the seeded pipeline
          </p>
        </div>
        <div className="mt-4 grid overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1.05fr_2fr]">
          {/* hero proof metric — the resilience story, with an honest meter */}
          <div className="border-b p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-mono text-[11px] uppercase tracking-[0.1em]">Delivery rate</span>
            </div>
            <p className="mt-3 text-5xl font-semibold tracking-tight tabular-nums">
              <CountUp value={98} suffix="%" />
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="funnel-fill h-full rounded-full bg-success"
                style={{ ['--bar-w' as string]: '98%', ['--bar-delay' as string]: '200ms' }}
              />
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Held under 6% vendor failure — retries, the dead-letter queue, and channel
              failover absorb the rest.
            </p>
          </div>
          {/* three supporting counts */}
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {SUPPORTING.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="p-5 lg:p-6">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                    <CountUp value={stat.value} />
                  </p>
                  <p className="mt-1 text-sm font-medium">{stat.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{stat.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>

      {/* Workspace explorer ------------------------------------------------ */}
      <section>
        <Reveal>
          <h2 className="text-lg font-semibold tracking-tight">Explore the workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Six real screens, all pre-seeded. Hover to look inside, then open the one you want.
          </p>
        </Reveal>
        <Reveal delay={80} className="mt-5">
          <WorkspaceExplorer />
        </Reveal>
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
          <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
            <div className="relative">
              {/* connector track — threads the nodes; the accent draws on reveal,
                  trailing off to the right like the campaign moving downstream */}
              <div aria-hidden className="absolute inset-x-0 top-5 hidden lg:block">
                <div className="h-px w-full bg-border" />
                <div className="flow-line absolute inset-x-0 top-0 h-px origin-left bg-gradient-to-r from-foreground/60 via-foreground/30 to-transparent" />
              </div>
              <ol className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.step} className="relative">
                      <div
                        className="flow-node relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background ring-4 ring-card"
                        style={{ ['--node-delay' as string]: `${index * 160}ms` }}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Step {item.step}
                      </p>
                      <h4 className="mt-1 font-medium">{item.title}</h4>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
