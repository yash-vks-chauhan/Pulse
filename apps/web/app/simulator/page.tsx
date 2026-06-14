'use client';

import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  FlaskConical,
  Mail,
  MessageSquare,
  Phone,
  Radio,
  RefreshCw,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NumberTicker } from '../../components/motion/number-ticker';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Slider } from '../../components/ui/slider';
import { cn } from '../../lib/utils';

/**
 * Chaos panel — live dials for the channel simulator. Crank a channel's
 * failure rate mid-campaign and watch retries, the DLQ, idempotent de-dup, and
 * channel failover absorb it. Talks to the simulator's admin API through a
 * server-side proxy; the admin key never reaches the browser.
 *
 * The page is built around understandability: a live telemetry strip grounds
 * the panel in real counters, each channel projects the downstream funnel its
 * dials imply (so the user sees the consequence before applying), and a sticky
 * action bar surfaces unsaved changes the way a settings console should.
 */

type Channel = 'whatsapp' | 'sms' | 'email' | 'rcs';
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'rcs'];

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: React.ComponentType<{ className?: string }>; note: string }
> = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, note: 'Read receipts · high engagement' },
  sms: { label: 'SMS', icon: Phone, note: 'Delivery only · no open / read event' },
  email: { label: 'Email', icon: Mail, note: 'Highest throughput · opens & clicks' },
  rcs: { label: 'RCS', icon: Radio, note: 'Rich cards · read receipts' },
};

interface ChannelProfile {
  latencyMinMs: number;
  latencyMaxMs: number;
  failureRate: number;
  ratePerSec: number;
  burst: number;
  engagementRate: number;
  clickRate: number;
}

interface ChaosProfile {
  duplicateRate: number;
  outOfOrderRate: number;
}

interface SimulatorStats {
  emitted?: number;
  duplicatesInjected?: number;
  retries?: number;
  dropped?: number;
}

interface SimulatorConfig {
  channels: Record<Channel, ChannelProfile>;
  chaos: ChaosProfile;
  stats?: SimulatorStats;
}

/**
 * Realistic "vendor" defaults — these mirror DEFAULT_CHANNEL_PROFILES / DEFAULT_CHAOS
 * in apps/channel-simulator/src/channels.ts. Used to draw the default tick on
 * each dial and to power "Reset to realistic defaults".
 */
const DEFAULT_DIALS: Record<Channel, Pick<ChannelProfile, 'failureRate' | 'engagementRate' | 'clickRate'>> = {
  whatsapp: { failureRate: 0.06, engagementRate: 0.65, clickRate: 0.25 },
  sms: { failureRate: 0.04, engagementRate: 0, clickRate: 0.08 },
  email: { failureRate: 0.02, engagementRate: 0.35, clickRate: 0.12 },
  rcs: { failureRate: 0.08, engagementRate: 0.55, clickRate: 0.2 },
};
const DEFAULT_CHAOS: ChaosProfile = { duplicateRate: 0.05, outOfOrderRate: 0.1 };

const TELEMETRY: {
  key: keyof SimulatorStats;
  label: string;
  meaning: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'emitted', label: 'Events emitted', meaning: 'Callbacks dispatched to the pipeline', icon: Activity },
  { key: 'retries', label: 'Webhook retries', meaning: 'Failed callbacks retried with backoff', icon: RefreshCw },
  { key: 'duplicatesInjected', label: 'Duplicates injected', meaning: 'Same event sent twice — idempotency test', icon: Copy },
  { key: 'dropped', label: 'Dropped to DLQ', meaning: 'Abandoned after max retry attempts', icon: AlertTriangle },
];

const round4 = (value: number) => Math.round(value * 10000) / 10000;

function failureSeverity(rate: number): { label: string; variant: 'success' | 'warning' | 'destructive' } {
  if (rate >= 0.3) return { label: 'Failing', variant: 'destructive' };
  if (rate >= 0.1) return { label: 'Degraded', variant: 'warning' };
  return { label: 'Healthy', variant: 'success' };
}

/** Count how many editable dials differ from the last-applied baseline. */
function countChanges(current: SimulatorConfig, baseline: SimulatorConfig | null): number {
  if (!baseline) return 0;
  let changes = 0;
  for (const channel of CHANNELS) {
    for (const field of ['failureRate', 'engagementRate', 'clickRate'] as const) {
      if (round4(current.channels[channel][field]) !== round4(baseline.channels[channel][field])) changes++;
    }
  }
  for (const field of ['duplicateRate', 'outOfOrderRate'] as const) {
    if (round4(current.chaos[field]) !== round4(baseline.chaos[field])) changes++;
  }
  return changes;
}

function PercentSlider({
  label,
  value,
  onChange,
  defaultValue,
  severity = false,
  disabled = false,
  disabledNote,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  defaultValue?: number;
  severity?: boolean;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const pct = Math.round(value * 100);
  const defaultPct = defaultValue != null ? Math.round(defaultValue * 100) : null;
  const tone =
    severity && !disabled
      ? pct >= 30
        ? 'text-destructive'
        : pct >= 10
          ? 'text-warning'
          : 'text-foreground'
      : 'text-foreground';

  return (
    <div className={cn(disabled && 'opacity-60')}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {disabled ? (
          <span className="text-[11px] text-muted-foreground">{disabledNote ?? '—'}</span>
        ) : (
          <span className={cn('font-semibold tabular-nums', tone)}>{pct}%</span>
        )}
      </div>
      <div className="relative mt-2">
        {defaultPct != null && !disabled && (
          <span
            aria-hidden
            title={`Realistic default ${defaultPct}%`}
            className="absolute top-1/2 z-0 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/30"
            style={{ left: `${defaultPct}%` }}
          />
        )}
        <Slider
          value={[pct]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onValueChange={([next]) => onChange(next / 100)}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/** Compact projection: of 1,000 sends, how many land / open / click given the dials. */
function ChannelProjection({ profile, hasOpen }: { profile: ChannelProfile; hasOpen: boolean }) {
  const sent = 1000;
  const delivered = Math.round(sent * (1 - profile.failureRate));
  const opened = hasOpen ? Math.round(delivered * profile.engagementRate) : 0;
  const clicked = hasOpen
    ? Math.round(opened * profile.clickRate)
    : Math.round(delivered * profile.clickRate);

  const widthPct = (value: number) => `${(value / sent) * 100}%`;

  return (
    <div className="mt-1 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Projected per 1,000 sent
        </span>
      </div>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/25 transition-[width] duration-500 ease-out"
          style={{ width: widthPct(delivered) }}
        />
        {hasOpen && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: widthPct(opened) }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-500 ease-out"
          style={{ width: widthPct(clicked) }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
        <Figure dotClass="bg-foreground/40" label="delivered" value={delivered} />
        {hasOpen ? (
          <Figure dotClass="bg-accent" label="opened" value={opened} />
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground/70">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            no opens
          </span>
        )}
        <Figure dotClass="bg-success" label="clicked" value={clicked} />
      </div>
    </div>
  );
}

function Figure({ dotClass, label, value }: { dotClass: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      <span className="font-medium tabular-nums text-foreground">{value.toLocaleString()}</span>
      <span>{label}</span>
    </span>
  );
}

function ChannelCard({
  channel,
  profile,
  index,
  onChange,
}: {
  channel: Channel;
  profile: ChannelProfile;
  index: number;
  onChange: (patch: Partial<ChannelProfile>) => void;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  const severity = failureSeverity(profile.failureRate);
  const defaults = DEFAULT_DIALS[channel];
  const hasOpen = defaults.engagementRate > 0;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };

  return (
    <div
      onMouseMove={handleMove}
      className="spotlight rise-in flex flex-col rounded-xl border bg-card p-5 shadow-sm"
      style={{ ['--rise-delay' as string]: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-foreground/70" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight">{meta.label}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.note}</p>
          </div>
        </div>
        <Badge variant={severity.variant} className="shrink-0 gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              severity.variant === 'success' && 'bg-success',
              severity.variant === 'warning' && 'bg-warning',
              severity.variant === 'destructive' && 'bg-destructive',
            )}
          />
          {severity.label}
        </Badge>
      </div>

      <div className="mt-3.5 flex items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span>{profile.ratePerSec}/s throughput</span>
        <span className="h-3 w-px bg-border" />
        <span>
          {profile.latencyMinMs}–{profile.latencyMaxMs}ms latency
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <PercentSlider
          label="Failure rate"
          value={profile.failureRate}
          defaultValue={defaults.failureRate}
          severity
          onChange={(failureRate) => onChange({ failureRate })}
        />
        <PercentSlider
          label="Engagement rate"
          value={profile.engagementRate}
          defaultValue={hasOpen ? defaults.engagementRate : undefined}
          disabled={!hasOpen}
          disabledNote="not on SMS"
          onChange={(engagementRate) => onChange({ engagementRate })}
        />
        <PercentSlider
          label={hasOpen ? 'Click rate' : 'Click rate (of delivered)'}
          value={profile.clickRate}
          defaultValue={defaults.clickRate}
          onChange={(clickRate) => onChange({ clickRate })}
        />
      </div>

      <ChannelProjection profile={profile} hasOpen={hasOpen} />
    </div>
  );
}

function TelemetryBar({ stats }: { stats: SimulatorStats | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-sm lg:grid-cols-4">
      {TELEMETRY.map((cell) => {
        const Icon = cell.icon;
        const value = stats?.[cell.key] ?? 0;
        return (
          <div key={cell.key} className="min-w-0 bg-card p-4 lg:p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {cell.label}
              </span>
              <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
            </div>
            <p className="mt-2.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
              <NumberTicker value={value} />
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{cell.meaning}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function SimulatorPage() {
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const [baseline, setBaseline] = useState<SimulatorConfig | null>(null);
  const [stats, setStats] = useState<SimulatorStats | undefined>(undefined);
  const [reachable, setReachable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/simulator', { cache: 'no-store' }).catch(() => null);
    if (!response || !response.ok) {
      setReachable(false);
      setError('Could not reach the simulator admin API.');
      return;
    }
    const data = (await response.json()) as SimulatorConfig;
    setReachable(true);
    setError(null);
    setConfig(data);
    setBaseline(structuredClone(data));
    setStats(data.stats);
  }, []);

  const refreshStats = useCallback(async () => {
    const response = await fetch('/api/simulator', { cache: 'no-store' }).catch(() => null);
    if (!response || !response.ok) {
      setReachable(false);
      return;
    }
    const data = (await response.json()) as SimulatorConfig;
    setReachable(true);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live telemetry — poll counters without disturbing in-progress edits.
  useEffect(() => {
    const id = setInterval(() => void refreshStats(), 4000);
    return () => clearInterval(id);
  }, [refreshStats]);

  useEffect(() => {
    if (savedAt == null) return;
    const id = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(id);
  }, [savedAt]);

  const changes = config ? countChanges(config, baseline) : 0;
  const dirty = changes > 0;

  function updateChannel(channel: Channel, patch: Partial<ChannelProfile>) {
    setConfig((current) =>
      current
        ? {
            ...current,
            channels: {
              ...current.channels,
              [channel]: { ...current.channels[channel], ...patch },
            },
          }
        : current,
    );
  }

  function updateChaos(patch: Partial<ChaosProfile>) {
    setConfig((current) => (current ? { ...current, chaos: { ...current.chaos, ...patch } } : current));
  }

  function resetToDefaults() {
    setConfig((current) => {
      if (!current) return current;
      const channels = { ...current.channels };
      for (const channel of CHANNELS) {
        channels[channel] = { ...channels[channel], ...DEFAULT_DIALS[channel] };
      }
      return { ...current, channels, chaos: { ...DEFAULT_CHAOS } };
    });
  }

  function revert() {
    if (!baseline) return;
    setConfig((current) =>
      current
        ? {
            ...current,
            channels: structuredClone(baseline.channels),
            chaos: { ...baseline.chaos },
          }
        : current,
    );
  }

  async function apply() {
    if (!config) return;
    setSaving(true);
    const response = await fetch('/api/simulator', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channels: config.channels, chaos: config.chaos }),
    }).catch(() => null);
    setSaving(false);
    if (!response || !response.ok) {
      setError('The simulator rejected the configuration.');
      return;
    }
    setError(null);
    setBaseline(structuredClone(config));
    setSavedAt(Date.now());
    void refreshStats();
  }

  // ---- Loading & hard-error states -------------------------------------------
  if (error && !config) {
    return (
      <div className="max-w-xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chaos panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live failure injection for the channel simulator.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-72 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Header ------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Chaos panel</h1>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                reachable
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                {reachable && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-1.5 w-1.5 rounded-full',
                    reachable ? 'bg-success' : 'bg-destructive',
                  )}
                />
              </span>
              {reachable ? 'Live' : 'Offline'}
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            These dials tune the vendor simulator in real time. Crank a channel&apos;s failure rate
            during a running campaign and watch retries, the dead-letter queue, idempotent de-dup,
            and channel failover absorb it — counters above update as it happens.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={resetToDefaults} className="shrink-0">
          <RotateCcw className="h-4 w-4" />
          Reset to realistic defaults
        </Button>
      </div>

      {/* Live telemetry ----------------------------------------------------- */}
      <div className="mt-6">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Simulator telemetry</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Since boot · refreshes every 4s
          </span>
        </div>
        <TelemetryBar stats={stats} />
      </div>

      {/* Channel dials ----------------------------------------------------- */}
      <div className="mt-7">
        <div className="mb-2.5">
          <h2 className="text-sm font-semibold tracking-tight">Channel dials</h2>
          <p className="text-xs text-muted-foreground">
            Throughput &amp; latency are fixed per channel; the tick on each track marks the
            realistic default.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {CHANNELS.map((channel, index) => (
            <ChannelCard
              key={channel}
              channel={channel}
              profile={config.channels[channel]}
              index={index}
              onChange={(patch) => updateChannel(channel, patch)}
            />
          ))}
        </div>
      </div>

      {/* Global callback chaos + what it proves ---------------------------- */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div
          className="spotlight rise-in rounded-xl border bg-card p-5 shadow-sm"
          style={{ ['--rise-delay' as string]: '120ms' }}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
            event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <FlaskConical className="h-5 w-5 text-foreground/70" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">Callback chaos</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Applies to every channel&apos;s webhooks
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            <PercentSlider
              label="Duplicate callbacks"
              value={config.chaos.duplicateRate}
              defaultValue={DEFAULT_CHAOS.duplicateRate}
              onChange={(duplicateRate) => updateChaos({ duplicateRate })}
            />
            <PercentSlider
              label="Out-of-order callbacks"
              value={config.chaos.outOfOrderRate}
              defaultValue={DEFAULT_CHAOS.outOfOrderRate}
              onChange={(outOfOrderRate) => updateChaos({ outOfOrderRate })}
            />
          </div>
        </div>

        <div className="rounded-xl border border-dashed bg-card/40 p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold tracking-tight">What this proves</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            However hard you crank the dials, the pipeline stays correct.
          </p>
          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <div className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
              <span>
                <span className="font-medium text-foreground">Failures</span> trigger retries with
                exponential backoff, then route to the dead-letter queue.
              </span>
            </div>
            <div className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <span className="font-medium text-foreground">Duplicate callbacks</span> are
                collapsed by idempotency keys — counts stay correct.
              </span>
            </div>
            <div className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              <span>
                <span className="font-medium text-foreground">Out-of-order events</span> are
                re-sequenced so the delivery timeline never lies.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky action bar — appears only with unsaved changes -------------- */}
      {(dirty || savedAt) && (
        <div className="pointer-events-none sticky bottom-5 z-40 mt-8 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/90 py-2 pl-5 pr-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/75">
            {dirty ? (
              <>
                <span className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  <span className="font-medium">
                    {changes} unsaved {changes === 1 ? 'change' : 'changes'}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={revert} className="rounded-full">
                  <Undo2 className="h-4 w-4" />
                  Revert
                </Button>
                <Button size="sm" onClick={() => void apply()} disabled={saving} className="rounded-full">
                  {saving ? 'Applying…' : 'Apply to simulator'}
                </Button>
              </>
            ) : (
              <span className="flex items-center gap-2 px-3 text-sm font-medium text-success">
                <Check className="h-4 w-4" />
                Applied to simulator
              </span>
            )}
          </div>
        </div>
      )}

      {error && config && (
        <p className="mt-4 text-center text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
