'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

/**
 * Campaign Copilot — the AI-proposes / human-approves flow:
 *   describe audience → AI proposes a Segment DSL → marketer edits rules and
 *   sees a live count → saves the segment → AI drafts channel-appropriate
 *   message variants → marketer picks/edits one, sets the failover policy →
 *   create & launch.
 *
 * Everything here talks to same-origin /api/* proxy routes; the CRM API key
 * never reaches the browser. Field/op definitions mirror the whitelisted
 * Segment DSL in packages/shared/src/segment-dsl.ts — the server re-validates
 * every document, this UI just keeps the marketer inside the lines.
 */

type Logic = 'AND' | 'OR';
interface Condition {
  field: string;
  op: string;
  value: number | string;
}
interface Dsl {
  logic: Logic;
  conditions: Condition[];
}
interface SampleCustomer {
  id: string;
  name: string;
  city: string | null;
  totalSpend: string;
  orderCount: number;
  lastOrderAt: string | null;
}

const FIELDS: Record<
  string,
  { label: string; kind: 'number' | 'days' | 'text'; ops: string[]; defaultOp: string; defaultValue: number | string }
> = {
  total_spend: { label: 'Total spend (₹)', kind: 'number', ops: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'], defaultOp: 'gt', defaultValue: 1000 },
  order_count: { label: 'Order count', kind: 'number', ops: ['gte', 'gt', 'lte', 'lt', 'eq', 'neq'], defaultOp: 'gte', defaultValue: 2 },
  last_order_at: { label: 'Last order', kind: 'days', ops: ['older_than_days', 'within_days'], defaultOp: 'older_than_days', defaultValue: 60 },
  created_at: { label: 'Customer since', kind: 'days', ops: ['older_than_days', 'within_days'], defaultOp: 'within_days', defaultValue: 90 },
  city: { label: 'City', kind: 'text', ops: ['eq', 'neq', 'contains'], defaultOp: 'eq', defaultValue: '' },
  tags: { label: 'Tag', kind: 'text', ops: ['includes'], defaultOp: 'includes', defaultValue: '' },
};

const OP_LABELS: Record<string, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
  older_than_days: 'older than (days)', within_days: 'within (days)',
  contains: 'contains', includes: 'includes',
};

const CHANNELS = ['whatsapp', 'sms', 'email', 'rcs'] as const;
type Channel = (typeof CHANNELS)[number];

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function errorText(status: number, payload: { error?: string; issues?: unknown[] }): string {
  if (status === 503) return 'AI is not configured on the server. Set at least one provider key: OPENROUTER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY. You can still build the segment and write the message manually.';
  if (status === 422) return 'The AI could not produce a valid result for that input — try rephrasing, or build the rules manually.';
  if (status === 429) return 'Rate limit hit — wait a minute and try again.';
  return `Request failed (${payload.error ?? status}).`;
}

export default function CopilotPage() {
  const router = useRouter();

  // Step 1 — audience intent
  const [prompt, setPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [usedNl, setUsedNl] = useState(false);

  // Step 2 — rules + preview + save
  const [dsl, setDsl] = useState<Dsl | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: SampleCustomer[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [savedSegment, setSavedSegment] = useState<{ id: string; name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Step 3 — campaign
  const [objective, setObjective] = useState('');
  const [primary, setPrimary] = useState<Channel>('whatsapp');
  const [failover, setFailover] = useState<Channel[]>([]);
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const dslKey = useMemo(() => (dsl ? JSON.stringify(dsl) : ''), [dsl]);

  // Live audience preview, debounced against rule edits.
  useEffect(() => {
    if (!dsl || dsl.conditions.length === 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setPreviewBusy(true);
      const result = await postJson('/api/segments/preview', { dsl });
      setPreviewBusy(false);
      setPreview(result.ok ? result.payload : null);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dslKey]);

  async function proposeSegment() {
    setAiBusy(true);
    setAiError(null);
    const result = await postJson('/api/ai/segment', { prompt });
    setAiBusy(false);
    if (!result.ok) {
      setAiError(errorText(result.status, result.payload));
      return;
    }
    setDsl(result.payload.dsl);
    setExplanation(result.payload.explanation);
    setUsedNl(true);
    setSavedSegment(null);
  }

  function startManually() {
    setDsl({ logic: 'AND', conditions: [{ field: 'order_count', op: 'gte', value: 2 }] });
    setExplanation(null);
    setUsedNl(false);
    setSavedSegment(null);
  }

  function updateCondition(index: number, next: Condition) {
    if (!dsl) return;
    const conditions = dsl.conditions.slice();
    conditions[index] = next;
    setDsl({ ...dsl, conditions });
    setSavedSegment(null);
  }

  function removeCondition(index: number) {
    if (!dsl) return;
    setDsl({ ...dsl, conditions: dsl.conditions.filter((_, i) => i !== index) });
    setSavedSegment(null);
  }

  function addCondition() {
    if (!dsl || dsl.conditions.length >= 10) return;
    setDsl({ ...dsl, conditions: [...dsl.conditions, { field: 'total_spend', op: 'gt', value: 1000 }] });
    setSavedSegment(null);
  }

  async function saveSegment() {
    if (!dsl) return;
    setSaveBusy(true);
    setSaveError(null);
    const result = await postJson('/api/segments', {
      name: segmentName,
      dsl,
      created_from: usedNl ? 'nl' : 'manual',
      ...(usedNl && prompt ? { nl_prompt: prompt } : {}),
    });
    setSaveBusy(false);
    if (!result.ok) {
      setSaveError(errorText(result.status, result.payload));
      return;
    }
    setSavedSegment({ id: result.payload.id, name: result.payload.name });
  }

  function toggleFailover(channel: Channel) {
    setFailover((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );
  }

  async function draftMessages() {
    setDraftBusy(true);
    setDraftError(null);
    const result = await postJson('/api/ai/draft', {
      objective,
      channel: primary,
      audience_summary: explanation ?? savedSegment?.name,
      variant_count: 3,
    });
    setDraftBusy(false);
    if (!result.ok) {
      setDraftError(errorText(result.status, result.payload));
      return;
    }
    const variants = (result.payload.variants as Array<{ text: string }>).map((v) => v.text);
    setDrafts(variants);
    if (variants.length > 0) setMessage(variants[0]);
  }

  async function createAndLaunch() {
    if (!savedSegment) return;
    setLaunchBusy(true);
    setLaunchError(null);
    const create = await postJson('/api/campaigns', {
      name: campaignName,
      objective: objective || undefined,
      message_template: message,
      segment_id: savedSegment.id,
      channel_policy: {
        primary,
        failover: failover.filter((c) => c !== primary),
        failoverWindowMinutes: windowMinutes,
      },
    });
    if (!create.ok) {
      setLaunchBusy(false);
      setLaunchError(errorText(create.status, create.payload));
      return;
    }
    const launch = await postJson(`/api/campaigns/${create.payload.id}/launch`, {});
    setLaunchBusy(false);
    if (!launch.ok) {
      setLaunchError(errorText(launch.status, launch.payload));
      return;
    }
    router.push(`/campaigns/${create.payload.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <h1 className="text-2xl font-semibold tracking-tight">Campaign Copilot</h1>
      <p className="mt-2 text-sm text-slate-600">
        Describe who you want to reach. The copilot proposes the audience, you approve and edit
        the rules, it drafts the message — you launch.
      </p>

      {/* Step 1 — intent */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">1 · Who do you want to reach?</h2>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={500}
          rows={2}
          placeholder='e.g. "shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000"'
          className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-pulse-500 focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void proposeSegment()}
            disabled={aiBusy || prompt.trim().length < 3}
            className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
          >
            {aiBusy ? 'Thinking…' : 'Propose segment'}
          </button>
          <button onClick={startManually} className="text-sm font-medium text-pulse-600 hover:underline">
            or build the rules manually
          </button>
        </div>
        {aiError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{aiError}</p>}
        {explanation && (
          <p className="mt-3 rounded-lg bg-pulse-50 p-3 text-sm text-slate-700">
            <span className="font-medium">Copilot:</span> {explanation}
          </p>
        )}
      </section>

      {/* Step 2 — rules + preview + save */}
      {dsl && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">2 · Review the audience rules</h2>
            <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
              {(['AND', 'OR'] as const).map((logic) => (
                <button
                  key={logic}
                  onClick={() => setDsl({ ...dsl, logic })}
                  className={`px-3 py-1 text-xs font-semibold ${dsl.logic === logic ? 'bg-pulse-600 text-white' : 'bg-white text-slate-600'}`}
                >
                  {logic === 'AND' ? 'Match ALL' : 'Match ANY'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {dsl.conditions.map((condition, index) => {
              const def = FIELDS[condition.field] ?? FIELDS.total_spend;
              return (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <select
                    value={condition.field}
                    onChange={(event) => {
                      const field = event.target.value;
                      const next = FIELDS[field];
                      updateCondition(index, { field, op: next.defaultOp, value: next.defaultValue });
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {Object.entries(FIELDS).map(([key, value]) => (
                      <option key={key} value={key}>{value.label}</option>
                    ))}
                  </select>
                  <select
                    value={condition.op}
                    onChange={(event) => updateCondition(index, { ...condition, op: event.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {def.ops.map((op) => (
                      <option key={op} value={op}>{OP_LABELS[op]}</option>
                    ))}
                  </select>
                  <input
                    type={def.kind === 'text' ? 'text' : 'number'}
                    value={condition.value}
                    min={0}
                    onChange={(event) =>
                      updateCondition(index, {
                        ...condition,
                        value: def.kind === 'text' ? event.target.value : Number(event.target.value),
                      })
                    }
                    className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => removeCondition(index)}
                    className="text-sm text-slate-400 hover:text-rose-600"
                    aria-label="Remove condition"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={addCondition} className="mt-3 text-sm font-medium text-pulse-600 hover:underline">
            + Add condition
          </button>

          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-medium">
              {previewBusy ? 'Counting…' : preview ? `${preview.count.toLocaleString()} customers match` : 'Add a condition to preview the audience'}
            </p>
            {preview && preview.sample.length > 0 && (
              <table className="mt-3 w-full text-left text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400">
                    <th className="py-1 pr-2 font-medium">Name</th>
                    <th className="py-1 pr-2 font-medium">City</th>
                    <th className="py-1 pr-2 font-medium">Spend</th>
                    <th className="py-1 pr-2 font-medium">Orders</th>
                    <th className="py-1 font-medium">Last order</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((customer) => (
                    <tr key={customer.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 pr-2">{customer.name}</td>
                      <td className="py-1 pr-2">{customer.city ?? '—'}</td>
                      <td className="py-1 pr-2">₹{Number(customer.totalSpend).toLocaleString()}</td>
                      <td className="py-1 pr-2">{customer.orderCount}</td>
                      <td className="py-1">
                        {customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString() : 'never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={segmentName}
              onChange={(event) => setSegmentName(event.target.value)}
              maxLength={200}
              placeholder="Segment name (e.g. Lapsed big spenders)"
              className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void saveSegment()}
              disabled={saveBusy || segmentName.trim().length === 0 || dsl.conditions.length === 0}
              className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
            >
              {saveBusy ? 'Saving…' : savedSegment ? 'Saved ✓ (save again)' : 'Save segment'}
            </button>
            {savedSegment && <span className="text-sm text-emerald-700">Segment “{savedSegment.name}” saved.</span>}
          </div>
          {saveError && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{saveError}</p>}
        </section>
      )}

      {/* Step 3 — message + channels + launch */}
      {savedSegment && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium">3 · Message & channel plan</h2>

          <label className="mt-3 block text-sm font-medium text-slate-700">Campaign objective</label>
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder='e.g. "Win them back with 15% off their favourite roast, code BREW15"'
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Primary channel</label>
              <select
                value={primary}
                onChange={(event) => {
                  const channel = event.target.value as Channel;
                  setPrimary(channel);
                  setFailover((current) => current.filter((c) => c !== channel));
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>{channel}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700">Failover (in click order)</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CHANNELS.filter((channel) => channel !== primary).map((channel) => {
                  const position = failover.indexOf(channel);
                  return (
                    <button
                      key={channel}
                      onClick={() => toggleFailover(channel)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                        position >= 0
                          ? 'bg-pulse-600 text-white ring-pulse-600'
                          : 'bg-white text-slate-600 ring-slate-300'
                      }`}
                    >
                      {position >= 0 ? `${position + 1}. ` : ''}{channel}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Failover window (min)</label>
              <input
                type="number"
                min={5}
                max={1440}
                value={windowMinutes}
                onChange={(event) => setWindowMinutes(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => void draftMessages()}
              disabled={draftBusy || objective.trim().length < 3}
              className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700 disabled:opacity-50"
            >
              {draftBusy ? 'Drafting…' : 'Draft message with AI'}
            </button>
            <span className="text-xs text-slate-500">or write it yourself below — merge tags: {'{{name}}'}, {'{{city}}'}</span>
          </div>
          {draftError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{draftError}</p>}

          {drafts.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {drafts.map((draft, index) => (
                <button
                  key={index}
                  onClick={() => setMessage(draft)}
                  className={`rounded-lg p-3 text-left text-xs leading-relaxed ring-1 transition ${
                    message === draft ? 'bg-pulse-50 ring-pulse-500' : 'bg-white ring-slate-200 hover:ring-pulse-300'
                  }`}
                >
                  {draft}
                </button>
              ))}
            </div>
          )}

          <label className="mt-4 block text-sm font-medium text-slate-700">Message ({primary})</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Hi {{name}}, we miss you…"
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              maxLength={200}
              placeholder="Campaign name"
              className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void createAndLaunch()}
              disabled={launchBusy || campaignName.trim().length === 0 || message.trim().length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {launchBusy ? 'Launching…' : `Create & launch to ${preview ? preview.count.toLocaleString() : '…'} customers`}
            </button>
          </div>
          {launchError && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{launchError}</p>}
        </section>
      )}
    </div>
  );
}
