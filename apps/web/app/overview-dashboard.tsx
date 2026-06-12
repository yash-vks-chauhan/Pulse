import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  GitBranch,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

/**
 * Workspace overview — the first screen after login. Explains what Pulse is
 * in one screen, with miniature mock-ups of the real UI (segment rules,
 * delivery funnel, failover, chaos panel) that link to the live pages they
 * preview.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';
const SIMULATOR_URL = process.env.SIMULATOR_URL ?? 'http://localhost:4100';

async function checkHealth(url: string): Promise<'up' | 'down'> {
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

function StatusPill({ status }: { status: 'up' | 'down' }) {
  return (
    <Badge variant={status === 'up' ? 'success' : 'destructive'}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === 'up' ? 'bg-success' : 'bg-destructive'}`}
      />
      {status === 'up' ? 'Operational' : 'Unreachable'}
    </Badge>
  );
}

const STEPS = [
  {
    step: '01',
    title: 'Describe',
    body: '“Shoppers who bought twice but went quiet for 60 days.” Plain language in — a validated audience out.',
  },
  {
    step: '02',
    title: 'Approve',
    body: 'The AI proposes editable rules, never opaque magic. You see the live audience count before anything sends.',
  },
  {
    step: '03',
    title: 'Execute',
    body: 'Queued dispatch with per-channel throttles, retries, and automatic failover when a channel lets you down.',
  },
  {
    step: '04',
    title: 'Learn',
    body: 'Live funnel, attributed revenue, and an AI-written next action — one click drafts the follow-up.',
  },
];

function DemoCard({
  href,
  icon: Icon,
  title,
  caption,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground/80">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-medium">{title}</h3>
        <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-accent" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
      <div className="mt-4 rounded-lg border bg-background p-4">{children}</div>
    </Link>
  );
}

function MiniFunnelBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export async function OverviewDashboard() {
  const [crm, simulator] = await Promise.all([
    checkHealth(CRM_API_URL),
    checkHealth(SIMULATOR_URL),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        AI-native mini CRM for reaching shoppers
      </span>
      <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight">
        Meet Pulse — your campaign copilot.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Brands don’t need another form-heavy CRM. Tell Pulse who you want to win back — it
        proposes the audience, the message, and the channel plan. You approve, it executes
        through a realistic delivery pipeline that survives failures, and it learns from the
        results to recommend your next move.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href="/copilot">
            <Sparkles />
            Start in the Copilot
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/campaigns">
            Browse campaigns
            <ArrowRight />
          </Link>
        </Button>
      </div>

      {/* How it works */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((item) => (
          <Card key={item.step}>
            <CardHeader className="pb-0">
              <span className="font-mono text-xs text-muted-foreground">{item.step}</span>
              <CardTitle className="pt-1">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Product tour — miniature versions of the real UI */}
      <h2 className="mt-12 text-lg font-semibold tracking-tight">What you’ll find inside</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each card is a miniature of the real screen it links to — the workspace is pre-seeded
        with 5,000 customers and a finished campaign, so everything below is explorable right now.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <DemoCard
          href="/copilot"
          icon={Sparkles}
          title="Copilot — language in, audience out"
          caption="The AI compiles your words into editable rules with a live match count."
        >
          <p className="text-xs italic text-muted-foreground">
            “shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000”
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">order count ≥ 2</span>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">last order older than 60 days</span>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">total spend &gt; ₹2,000</span>
            <span className="rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">match ALL</span>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs font-medium tabular-nums">
            1,284 customers match
            <Badge variant="ai" className="px-2 text-[10px]">AI-proposed</Badge>
          </p>
        </DemoCard>

        <DemoCard
          href="/campaigns"
          icon={Activity}
          title="Live delivery funnel"
          caption="Stats refresh every 3 seconds while a campaign runs — derived from the append-only event log."
        >
          <div className="space-y-2">
            <MiniFunnelBar label="Sent" pct={100} color="bg-foreground/70" />
            <MiniFunnelBar label="Delivered" pct={91} color="bg-accent" />
            <MiniFunnelBar label="Opened / read" pct={64} color="bg-violet-500" />
            <MiniFunnelBar label="Clicked" pct={22} color="bg-success" />
          </div>
        </DemoCard>

        <DemoCard
          href="/campaigns"
          icon={GitBranch}
          title="Channel failover"
          caption="If WhatsApp hard-fails or stalls, Pulse automatically escalates to the next channel."
        >
          <div className="flex items-center gap-2 text-xs">
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
        </DemoCard>

        <DemoCard
          href="/simulator"
          icon={FlaskConical}
          title="Chaos panel"
          caption="The vendor simulator is real — crank failures mid-campaign and watch the system absorb it."
        >
          <div className="text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>WhatsApp failure rate</span>
              <span className="font-semibold text-foreground tabular-nums">40%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[40%] rounded-full bg-warning" />
            </div>
            <p className="mt-3">
              Retries, the dead-letter queue, and failover keep reach high — duplicates and
              out-of-order callbacks included.
            </p>
          </div>
        </DemoCard>
      </div>

      {/* Service health */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>CRM API</CardTitle>
            <StatusPill status={crm} />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ingest, campaigns, receipts, insights. NestJS + Prisma + BullMQ.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Channel Simulator</CardTitle>
            <StatusPill status={simulator} />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              WhatsApp / SMS / Email / RCS vendor stand-in with chaos dials.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Get started */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Upload customers and orders as CSV on the{' '}
              <Link href="/data" className="font-medium text-accent hover:underline">Data page</Link>, or
              POST them to the ingestion API (see{' '}
              <Link href="/docs" className="font-medium text-accent hover:underline">API Docs</Link>).
            </li>
            <li>
              Open the <Link href="/copilot" className="font-medium text-accent hover:underline">Copilot</Link>:
              describe the audience in plain language, approve the proposed rules, pick the channel
              plan, launch.
            </li>
            <li>
              Watch delivery states converge live on the{' '}
              <Link href="/campaigns" className="font-medium text-accent hover:underline">campaign dashboard</Link>{' '}
              — including failover rescues.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
