'use client';

import { Check, FlaskConical, Mail, MessageSquare, Phone, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Slider } from '../../components/ui/slider';

/**
 * Chaos panel — live dials for the channel simulator. Crank a channel's
 * failure rate mid-campaign and watch the DLQ + failover absorb it. Talks to
 * the simulator's admin API through a server-side proxy; the admin key never
 * reaches the browser.
 */

type Channel = 'whatsapp' | 'sms' | 'email' | 'rcs';
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'rcs'];

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare },
  sms: { label: 'SMS', icon: Phone },
  email: { label: 'Email', icon: Mail },
  rcs: { label: 'RCS', icon: Radio },
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

interface SimulatorConfig {
  channels: Record<Channel, ChannelProfile>;
  chaos: { duplicateRate: number; outOfOrderRate: number };
  stats?: Record<string, number>;
}

function PercentSlider({
  label,
  value,
  onChange,
  accent = false,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  accent?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={`font-semibold tabular-nums ${accent && pct >= 30 ? 'text-warning' : 'text-foreground'}`}
        >
          {pct}%
        </span>
      </div>
      <Slider
        value={[pct]}
        min={0}
        max={100}
        step={1}
        onValueChange={([next]) => onChange(next / 100)}
        className="mt-2"
        aria-label={label}
      />
    </div>
  );
}

export default function SimulatorPage() {
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load() {
    const response = await fetch('/api/simulator', { cache: 'no-store' });
    if (!response.ok) {
      setError('Could not reach the simulator admin API.');
      return;
    }
    setError(null);
    setConfig((await response.json()) as SimulatorConfig);
  }

  useEffect(() => {
    void load();
  }, []);

  function updateChannel(channel: Channel, patch: Partial<ChannelProfile>) {
    setConfig((current) =>
      current
        ? { ...current, channels: { ...current.channels, [channel]: { ...current.channels[channel], ...patch } } }
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
    });
    setSaving(false);
    if (!response.ok) {
      setError('The simulator rejected the configuration.');
      return;
    }
    setError(null);
    setSavedAt(Date.now());
    void load();
  }

  if (error && !config) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-3xl">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!config) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <h1 className="text-2xl font-semibold tracking-tight">Chaos panel</h1>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
        These dials change the vendor simulator live — crank a failure rate during a running
        campaign and watch retries, the DLQ, and channel failover absorb it.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {CHANNELS.map((channel) => {
          const profile = config.channels[channel];
          const meta = CHANNEL_META[channel];
          const Icon = meta.icon;
          return (
            <Card key={channel}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-foreground/70" />
                  </span>
                  <CardTitle>{meta.label}</CardTitle>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {profile.ratePerSec}/s · {profile.latencyMinMs}–{profile.latencyMaxMs}ms
                </span>
              </CardHeader>
              <CardContent className="space-y-4">
                <PercentSlider
                  label="Failure rate"
                  value={profile.failureRate}
                  accent
                  onChange={(failureRate) => updateChannel(channel, { failureRate })}
                />
                <PercentSlider
                  label="Engagement rate"
                  value={profile.engagementRate}
                  onChange={(engagementRate) => updateChannel(channel, { engagementRate })}
                />
                <PercentSlider
                  label="Click rate"
                  value={profile.clickRate}
                  onChange={(clickRate) => updateChannel(channel, { clickRate })}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center gap-2.5 space-y-0">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Callback chaos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <PercentSlider
              label="Duplicate callbacks"
              value={config.chaos.duplicateRate}
              onChange={(duplicateRate) =>
                setConfig({ ...config, chaos: { ...config.chaos, duplicateRate } })
              }
            />
            <PercentSlider
              label="Out-of-order callbacks"
              value={config.chaos.outOfOrderRate}
              onChange={(outOfOrderRate) =>
                setConfig({ ...config, chaos: { ...config.chaos, outOfOrderRate } })
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={() => void apply()} disabled={saving}>
          {saving ? 'Applying…' : 'Apply to simulator'}
        </Button>
        {savedAt && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Applied
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {config.stats && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Simulator counters (since boot)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-3">
              {Object.entries(config.stats).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span>{key}</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {Number(value).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
