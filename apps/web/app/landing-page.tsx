import {
  Activity,
  ArrowRight,
  FlaskConical,
  GitBranch,
  PenLine,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { PulseLogo } from '../components/logo';
import { Aurora } from '../components/motion/aurora';
import { BlurText } from '../components/motion/blur-text';
import { CountUp } from '../components/motion/count-up';
import { Reveal } from '../components/motion/reveal';
import { SplitText } from '../components/motion/split-text';
import { ThemeToggle } from '../components/theme-toggle';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

/**
 * Public landing page — what logged-out visitors see at /. Marketing chrome
 * only; every number shown is produced by the real pipeline (seeded demo
 * workspace), not invented copy.
 */

/* ------------------------------- hero visual ------------------------------ */

function FunnelRow({
  label,
  value,
  pct,
  color,
  delay,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  delay: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value} <span className="text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`funnel-fill h-full rounded-full ${color}`}
          style={{
            ['--bar-w' as string]: `${pct}%`,
            ['--bar-delay' as string]: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

function HeroPreview() {
  return (
    <Reveal className="relative mx-auto mt-16 max-w-3xl" delay={150}>
      {/* main app window */}
      <div className="frame-ring overflow-hidden rounded-2xl bg-card">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="mx-auto flex items-center rounded-md bg-background px-3 py-1 font-mono text-[11px] text-muted-foreground">
            pulse.app/campaigns/monsoon-malabar
          </span>
          <span className="w-12" />
        </div>
        <div className="p-6 text-left">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold tracking-tight">
              Monsoon Malabar launch
            </h3>
            <Badge variant="accent" className="gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 [animation:ping-soft_1.6s_ease-out_infinite]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Running
            </Badge>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
              refreshing every 3s
            </span>
          </div>
          <div className="mt-5 space-y-3.5">
            <FunnelRow label="Sent" value="2,847" pct={100} color="bg-foreground/70" delay={100} />
            <FunnelRow label="Delivered" value="2,591" pct={91} color="bg-accent" delay={250} />
            <FunnelRow label="Opened / read" value="1,822" pct={64} color="bg-violet-500" delay={400} />
            <FunnelRow label="Clicked" value="627" pct={22} color="bg-success" delay={550} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
              whatsapp ✗ stalled
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="rounded-md bg-success/10 px-2 py-1 font-medium text-success">
              sms ✓ delivered
            </span>
            <span className="ml-1 text-muted-foreground">
              214 customers rescued by failover
            </span>
          </div>
        </div>
      </div>

      {/* floating copilot card */}
      <div className="frame-ring absolute -right-10 -top-12 hidden w-64 rounded-xl bg-card p-4 text-left lg:block animate-float">
        <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" />
          Copilot proposal
        </p>
        <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground">
          “bought twice, quiet for 60 days, spend over ₹2,000”
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">orders ≥ 2</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">last order &gt; 60d</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">spend &gt; ₹2,000</span>
        </div>
        <p className="mt-2.5 text-xs font-semibold tabular-nums">
          1,284 customers match
        </p>
      </div>
    </Reveal>
  );
}

/* --------------------------------- content -------------------------------- */

const STATS: Array<{ value: number; suffix?: string; label: string }> = [
  { value: 5000, label: 'customers in the demo workspace' },
  { value: 23723, label: 'orders ingested & encrypted' },
  { value: 98, suffix: '%', label: 'delivery rate under 6% vendor failure' },
  { value: 214, label: 'messages rescued by channel failover' },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Natural-language segments',
    body: '“Bought twice but quiet for 60 days” becomes editable rules with a live audience count. The AI proposes; you approve.',
  },
  {
    icon: PenLine,
    title: 'Channel-aware drafts',
    body: 'Three message variants tuned to WhatsApp, SMS, email or RCS — merge tags included, your edits always win.',
  },
  {
    icon: GitBranch,
    title: 'Automatic failover',
    body: 'A channel hard-fails or stalls past your window and Pulse escalates to the next one. No customer left unreached.',
  },
  {
    icon: Activity,
    title: 'Live delivery funnel',
    body: 'Sent → delivered → opened → clicked, derived from an append-only event log and refreshed every three seconds.',
  },
  {
    icon: FlaskConical,
    title: 'Chaos-tested by design',
    body: 'The vendor simulator is real. Crank failure rates mid-campaign and watch retries, the DLQ and failover absorb it.',
  },
  {
    icon: TrendingUp,
    title: 'Revenue attribution',
    body: 'Orders inside the attribution window roll up to the campaign — with an AI-written summary and a one-click follow-up.',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Describe',
    body: 'Tell Pulse who you want to win back, in plain language. It compiles your words into validated rules.',
  },
  {
    step: '02',
    title: 'Approve',
    body: 'Editable rules, never opaque magic. You see the live audience count before anything sends.',
  },
  {
    step: '03',
    title: 'Execute',
    body: 'Queued dispatch with per-channel throttles, retries, and automatic failover when a vendor lets you down.',
  },
  {
    step: '04',
    title: 'Learn',
    body: 'Attributed revenue and an AI-written next action — one click drafts the follow-up campaign.',
  },
];

const CURL_SNIPPET = `curl -X POST https://pulse-api.up.railway.app/api/ingest/customers \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{ "customers": [{ "external_id": "cust-1001",
        "name": "Asha Kulkarni", "city": "Pune",
        "tags": ["subscriber"] }] }'

# → { "upserted": 1 }   idempotent · PII encrypted at rest`;

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      {/* background: aurora + dot grid, masked to the hero */}
      <div className="absolute inset-x-0 top-0 h-[720px]">
        <Aurora />
        <div className="bg-dot-grid mask-fade-edges absolute inset-0" />
      </div>

      {/* header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" aria-label="Pulse home">
            <PulseLogo markClassName="h-7 w-7" wordClassName="text-base" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#product" className="transition-colors hover:text-foreground">
              Product
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#developers" className="transition-colors hover:text-foreground">
              Developers
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/login">
                Sign in
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* hero */}
        <section className="container pb-24 pt-20 text-center sm:pt-28">
          <BlurText as="div" delay={0} className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              AI-native CRM for shopper re-engagement
            </span>
          </BlurText>

          <h1 className="mx-auto mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            <SplitText text="Describe the audience." delay={150} />
            <br />
            <span className="split-word" style={{ ['--word-delay' as string]: '430ms' }}>
              Pulse&nbsp;
            </span>
            <span className="split-word" style={{ ['--word-delay' as string]: '500ms' }}>
              runs&nbsp;
            </span>
            <span className="split-word" style={{ ['--word-delay' as string]: '570ms' }}>
              the&nbsp;
            </span>
            <span
              className="split-word font-editorial font-normal text-foreground/90"
              style={{ ['--word-delay' as string]: '640ms' }}
            >
              campaign.
            </span>
          </h1>

          <BlurText
            delay={750}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground"
          >
            Plain language in, validated audience out. Pulse proposes the rules,
            drafts the message, delivers across four channels with automatic
            failover — and tells you what to do next.
          </BlurText>

          <BlurText as="div" delay={900} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                Enter the workspace
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#developers">Explore the API</a>
            </Button>
          </BlurText>
          <BlurText delay={1050} className="mt-4 text-xs text-muted-foreground">
            Pre-seeded with 5,000 customers — reviewer access in one click.
          </BlurText>

          <HeroPreview />
        </section>

        {/* stats band */}
        <section className="border-y bg-muted/30">
          <div className="container grid grid-cols-2 gap-x-6 gap-y-10 py-14 lg:grid-cols-4">
            {STATS.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 90} className="text-center">
                <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                  <CountUp value={stat.value} suffix={stat.suffix ?? ''} />
                </p>
                <p className="mx-auto mt-2 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
                  {stat.label}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* features */}
        <section id="product" className="container scroll-mt-20 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything between{' '}
              <span className="font-editorial font-normal">intent</span> and{' '}
              <span className="font-editorial font-normal">impact</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Not another form-heavy CRM. One conversation-grade input, a
              delivery pipeline that survives vendor failures, and analytics
              that close the loop.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Reveal
                  key={feature.title}
                  delay={(index % 3) * 100}
                  className="group rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-foreground/20"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground/80 transition-colors group-hover:bg-foreground group-hover:text-background">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <h3 className="mt-4 font-medium">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-20 border-y bg-muted/30">
          <div className="container py-24">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Four steps, fully supervised
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The AI proposes at every step — it never acts without you.
              </p>
            </Reveal>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Reveal key={step.step} delay={index * 110}>
                  <p className="font-mono text-sm text-muted-foreground">{step.step}</p>
                  <div className="mt-3 h-px w-full bg-border" />
                  <h3 className="mt-4 font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* developers */}
        <section id="developers" className="container scroll-mt-20 py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                For developers
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                API-first underneath
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                Batched, idempotent ingestion with server-side validation and
                PII encryption at rest. Webhooks are HMAC-signed with a replay
                window. Everything the UI does, the API does too.
              </p>
              <Button asChild variant="outline" className="mt-7">
                <Link href="/docs">
                  Read the API docs
                  <ArrowRight />
                </Link>
              </Button>
            </Reveal>
            <Reveal delay={120}>
              <pre className="frame-ring overflow-x-auto rounded-xl bg-zinc-950 p-5 font-mono text-xs leading-relaxed text-zinc-200 dark:bg-zinc-900/70">
                {CURL_SNIPPET}
              </pre>
            </Reveal>
          </div>
        </section>

        {/* final CTA */}
        <section className="border-t">
          <div className="container py-24 text-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
                See it <span className="font-editorial font-normal">run.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                The demo workspace is live — seeded customers, a finished
                campaign, and a chaos panel waiting to be cranked.
              </p>
              <Button asChild size="lg" className="mt-8">
                <Link href="/login">
                  Enter the workspace
                  <ArrowRight />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                The access code is shown right on the login screen.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground sm:flex-row">
          <PulseLogo markClassName="h-6 w-6" wordClassName="text-sm" />
          <p className="text-center text-xs leading-relaxed sm:text-right">
            Built end-to-end as an engineering exercise — every number above is
            produced by the live pipeline, not copy.
          </p>
        </div>
      </footer>
    </div>
  );
}
