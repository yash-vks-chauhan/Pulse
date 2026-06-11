'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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
  revenue: { attributed_orders: number; attributed_revenue: number; attribution_window_hours: number };
  non_engaged_audience: number;
  narrative: { source: 'ai' | 'heuristic'; summary: string; recommendation: string };
  suggested_follow_up: { channel: string; objective: string; estimated_audience: number };
}

const FUNNEL_STEPS: Array<{ key: keyof Stats['funnel']; label: string; color: string }> = [
  { key: 'sent', label: 'Sent', color: 'bg-pulse-500' },
  { key: 'delivered', label: 'Delivered', color: 'bg-sky-500' },
  { key: 'engaged', label: 'Opened / read', color: 'bg-violet-500' },
  { key: 'clicked', label: 'Clicked', color: 'bg-emerald-500' },
];

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
    return <p className="mx-auto max-w-3xl rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>;
  }
  if (!stats) {
    return <p className="mx-auto max-w-3xl text-sm text-slate-500">Loading…</p>;
  }

  const base = Math.max(stats.total, 1);

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link href="/campaigns" className="text-sm text-pulse-600 hover:underline">← Campaigns</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{stats.campaign.name}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            stats.campaign.status === 'RUNNING'
              ? 'bg-sky-100 text-sky-800'
              : stats.campaign.status === 'COMPLETED'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {stats.campaign.status}
        </span>
        {stats.campaign.status === 'DRAFT' && (
          <button
            onClick={() => void launch()}
            disabled={launching}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {launching ? 'Launching…' : 'Launch'}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {stats.campaign.audience_snapshot_count.toLocaleString()} customers in the snapshot
        {stats.campaign.launched_at && ` · launched ${new Date(stats.campaign.launched_at).toLocaleString()}`}
        {stats.campaign.status === 'RUNNING' && ' · live, refreshing every 3s'}
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">Delivery funnel</h2>
        <div className="mt-4 space-y-3">
          {FUNNEL_STEPS.map((step) => {
            const value = stats.funnel[step.key];
            return (
              <div key={step.key}>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{step.label}</span>
                  <span>
                    {value.toLocaleString()} ({Math.round((value / base) * 100)}%)
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${step.color} transition-all duration-700`}
                    style={{ width: `${Math.min(100, (value / base) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Queued: {stats.funnel.queued.toLocaleString()}</span>
          <span className="text-rose-600">Failed: {stats.funnel.failed.toLocaleString()}</span>
          <span>Total communications: {stats.total.toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium">Channel failover</h2>
          {stats.failover.escalations === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No escalations (yet).</p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-semibold text-pulse-700">{stats.failover.escalations.toLocaleString()}</span>{' '}
              messages escalated to a fallback channel —{' '}
              <span className="font-semibold text-emerald-700">{stats.failover.rescued.toLocaleString()}</span>{' '}
              customers rescued (reached after the primary channel failed).
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium">Raw status counts</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm text-slate-600">
            {Object.entries(stats.status_counts)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <div key={status} className="flex justify-between">
                  <span>{status}</span>
                  <span className="font-medium">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {stats.campaign.status !== 'DRAFT' && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Insights</h2>
            <button
              onClick={() => void loadInsights()}
              disabled={insightsBusy}
              className="rounded-lg bg-pulse-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
            >
              {insightsBusy ? 'Analyzing…' : insights ? 'Refresh insights' : 'Generate insights'}
            </button>
          </div>
          {insightsError && (
            <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{insightsError}</p>
          )}

          {insights && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-pulse-50 p-4 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">
                    {insights.narrative.source === 'ai' ? 'Copilot' : 'Summary'}:
                  </span>{' '}
                  {insights.narrative.summary}
                </p>
                <p className="mt-2">
                  <span className="font-semibold">Next:</span> {insights.narrative.recommendation}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="rounded-lg bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-700">Attributed revenue ({insights.revenue.attribution_window_hours}h window)</p>
                  <p className="text-lg font-semibold text-emerald-800">
                    ₹{insights.revenue.attributed_revenue.toLocaleString('en-IN')}
                    <span className="ml-2 text-xs font-normal">
                      {insights.revenue.attributed_orders} orders
                    </span>
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-500">Reached but never engaged</p>
                  <p className="text-lg font-semibold text-slate-700">
                    {insights.non_engaged_audience.toLocaleString()} customers
                  </p>
                </div>
              </div>

              <table className="w-full text-left text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400">
                    <th className="py-1.5 pr-2 font-medium">Channel</th>
                    <th className="py-1.5 pr-2 font-medium">Attempted</th>
                    <th className="py-1.5 pr-2 font-medium">Delivered</th>
                    <th className="py-1.5 pr-2 font-medium">Engaged</th>
                    <th className="py-1.5 pr-2 font-medium">Clicked</th>
                    <th className="py-1.5 pr-2 font-medium">Converted</th>
                    <th className="py-1.5 font-medium">Delivery rate</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.channels.map((channel) => (
                    <tr key={channel.channel} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2 font-medium">{channel.channel}</td>
                      <td className="py-1.5 pr-2">{channel.attempted.toLocaleString()}</td>
                      <td className="py-1.5 pr-2">{channel.delivered.toLocaleString()}</td>
                      <td className="py-1.5 pr-2">{channel.engaged.toLocaleString()}</td>
                      <td className="py-1.5 pr-2">{channel.clicked.toLocaleString()}</td>
                      <td className="py-1.5 pr-2">{channel.converted.toLocaleString()}</td>
                      <td className="py-1.5">{channel.delivery_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {insights.suggested_follow_up.estimated_audience > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-200 bg-white p-4">
                  <p className="text-sm text-slate-600">
                    Follow up with the{' '}
                    <span className="font-semibold">
                      {insights.suggested_follow_up.estimated_audience.toLocaleString()} customers
                    </span>{' '}
                    who never engaged — via{' '}
                    <span className="font-semibold">{insights.suggested_follow_up.channel}</span>.
                  </p>
                  <button
                    onClick={() => void createFollowUp()}
                    disabled={followUpBusy}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {followUpBusy ? 'Creating…' : 'Create follow-up campaign'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
