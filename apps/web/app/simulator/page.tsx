'use client';

import { useEffect, useState } from 'react';

/**
 * Chaos panel — live dials for the channel simulator. Crank a channel's
 * failure rate mid-campaign and watch the DLQ + failover absorb it. Talks to
 * the simulator's admin API through a server-side proxy; the admin key never
 * reaches the browser.
 */

type Channel = 'whatsapp' | 'sms' | 'email' | 'rcs';
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'rcs'];

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
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="block text-xs text-slate-600">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-semibold">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="mt-1 w-full accent-pulse-600"
      />
    </label>
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
    return <p className="mx-auto max-w-3xl rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>;
  }
  if (!config) {
    return <p className="mx-auto max-w-3xl text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <h1 className="text-2xl font-semibold tracking-tight">Simulator chaos panel</h1>
      <p className="mt-2 text-sm text-slate-600">
        These dials change the vendor simulator live — crank a failure rate during a running
        campaign and watch retries, the DLQ, and channel failover absorb it.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {CHANNELS.map((channel) => {
          const profile = config.channels[channel];
          return (
            <div key={channel} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-medium capitalize">{channel}</h2>
                <span className="text-xs text-slate-400">
                  {profile.ratePerSec}/s · {profile.latencyMinMs}–{profile.latencyMaxMs}ms
                </span>
              </div>
              <div className="mt-3 space-y-3">
                <PercentSlider
                  label="Failure rate"
                  value={profile.failureRate}
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
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">Callback chaos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => void apply()}
          disabled={saving}
          className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
        >
          {saving ? 'Applying…' : 'Apply to simulator'}
        </button>
        {savedAt && <span className="text-sm text-emerald-700">Applied ✓</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>

      {config.stats && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium">Simulator counters (since boot)</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm text-slate-600 sm:grid-cols-3">
            {Object.entries(config.stats).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span>{key}</span>
                <span className="font-medium">{Number(value).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
