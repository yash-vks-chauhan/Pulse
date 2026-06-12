'use client';

import { Check, Plus, Rocket, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';

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
const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  rcs: 'RCS',
};

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
  if (payload.error === 'ai_rate_limited') return 'AI requests are used up for now — every provider in the chain is rate-limited (free-tier quotas). They cool down automatically; try again in a few minutes, or continue manually below.';
  if (status === 503) return 'AI is not configured on the server. Set at least one provider key: OPENROUTER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY. You can still build the segment and write the message manually.';
  if (status === 422) return 'The AI could not produce a valid result for that input — try rephrasing, or build the rules manually.';
  if (status === 429) return 'Rate limit hit — wait a minute and try again.';
  return `Request failed (${payload.error ?? status}).`;
}

/** "openrouter:openai/gpt-oss-120b:free" → "gpt-oss-120b · via openrouter" */
function formatModel(servedBy: string): string {
  const [provider, ...rest] = servedBy.split(':');
  const model = rest.join(':').split('/').pop()?.replace(/:free$/, '');
  return model ? `${model} · via ${provider}` : servedBy;
}

function StepHeader({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs font-semibold text-foreground/80">
        {step}
      </span>
      <h2 className="font-medium">{title}</h2>
    </div>
  );
}

export default function CopilotPage() {
  const router = useRouter();

  // Step 1 — audience intent
  const [prompt, setPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [segmentModel, setSegmentModel] = useState<string | null>(null);
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
  const [draftModel, setDraftModel] = useState<string | null>(null);
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
    setSegmentModel(typeof result.payload.model === 'string' ? result.payload.model : null);
    setUsedNl(true);
    setSavedSegment(null);
  }

  function startManually() {
    setDsl({ logic: 'AND', conditions: [{ field: 'order_count', op: 'gte', value: 2 }] });
    setExplanation(null);
    setSegmentModel(null);
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
    setDraftModel(typeof result.payload.model === 'string' ? result.payload.model : null);
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
      <p className="mt-1 text-sm text-muted-foreground">
        Describe who you want to reach. The copilot proposes the audience, you approve and edit
        the rules, it drafts the message — you launch.
      </p>

      {/* Step 1 — intent */}
      <Card className="mt-6">
        <CardHeader>
          <StepHeader step="1" title="Who do you want to reach?" />
        </CardHeader>
        <CardContent>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder='e.g. "shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000"'
          />
          <div className="mt-3 flex items-center gap-3">
            <Button
              onClick={() => void proposeSegment()}
              disabled={aiBusy || prompt.trim().length < 3}
            >
              <Sparkles />
              {aiBusy ? 'Thinking…' : 'Propose segment'}
            </Button>
            <Button variant="link" onClick={startManually} className="px-0">
              or build the rules manually
            </Button>
          </div>
          {aiError && (
            <Alert variant="warning" className="mt-3">
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}
          {aiBusy && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3.5" aria-live="polite">
              <p className="shimmer-text text-sm font-medium">
                ✦ Copilot is thinking — proposing your audience…
              </p>
              <div className="mt-2.5 space-y-1.5" aria-hidden>
                <Skeleton className="h-2 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
            </div>
          )}
          {explanation && !aiBusy && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3.5 text-sm leading-relaxed">
              <p className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  <span className="font-medium">Copilot:</span> {explanation}
                </span>
              </p>
              {segmentModel && (
                <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                  {formatModel(segmentModel)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — rules + preview + save */}
      {dsl && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <StepHeader step="2" title="Review the audience rules" />
            <div className="flex overflow-hidden rounded-lg ring-1 ring-border">
              {(['AND', 'OR'] as const).map((logic) => (
                <button
                  key={logic}
                  onClick={() => setDsl({ ...dsl, logic })}
                  className={cn(
                    'px-3 py-1 text-xs font-semibold transition-colors',
                    dsl.logic === logic
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {logic === 'AND' ? 'Match ALL' : 'Match ANY'}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dsl.conditions.map((condition, index) => {
                const def = FIELDS[condition.field] ?? FIELDS.total_spend;
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={condition.field}
                      onValueChange={(field) => {
                        const next = FIELDS[field];
                        updateCondition(index, { field, op: next.defaultOp, value: next.defaultValue });
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELDS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={condition.op}
                      onValueChange={(op) => updateCondition(index, { ...condition, op })}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {def.ops.map((op) => (
                          <SelectItem key={op} value={op}>
                            {OP_LABELS[op]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type={def.kind === 'text' ? 'text' : 'number'}
                      value={condition.value}
                      min={0}
                      onChange={(event) =>
                        updateCondition(index, {
                          ...condition,
                          value: def.kind === 'text' ? event.target.value : Number(event.target.value),
                        })
                      }
                      className="w-32"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(index)}
                      aria-label="Remove condition"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={addCondition} className="mt-3 text-accent">
              <Plus />
              Add condition
            </Button>

            <div className="mt-4 rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium tabular-nums">
                {previewBusy
                  ? 'Counting…'
                  : preview
                    ? `${preview.count.toLocaleString()} customers match`
                    : 'Add a condition to preview the audience'}
              </p>
              {preview && preview.sample.length > 0 && (
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 px-2">Name</TableHead>
                      <TableHead className="h-8 px-2">City</TableHead>
                      <TableHead className="h-8 px-2 text-right">Spend</TableHead>
                      <TableHead className="h-8 px-2 text-right">Orders</TableHead>
                      <TableHead className="h-8 px-2 text-right">Last order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="px-2 py-1.5">{customer.name}</TableCell>
                        <TableCell className="px-2 py-1.5 text-muted-foreground">
                          {customer.city ?? '—'}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                          ₹{Number(customer.totalSpend).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                          {customer.orderCount}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                          {customer.lastOrderAt
                            ? new Date(customer.lastOrderAt).toLocaleDateString()
                            : 'never'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Input
                value={segmentName}
                onChange={(event) => setSegmentName(event.target.value)}
                maxLength={200}
                placeholder="Segment name (e.g. Lapsed big spenders)"
                className="w-72"
              />
              <Button
                onClick={() => void saveSegment()}
                disabled={saveBusy || segmentName.trim().length === 0 || dsl.conditions.length === 0}
              >
                {saveBusy ? 'Saving…' : savedSegment ? 'Saved — save again' : 'Save segment'}
              </Button>
              {savedSegment && (
                <span className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="h-4 w-4" />
                  Segment “{savedSegment.name}” saved.
                </span>
              )}
            </div>
            {saveError && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — message + channels + launch */}
      {savedSegment && (
        <Card className="mt-4">
          <CardHeader>
            <StepHeader step="3" title="Message & channel plan" />
          </CardHeader>
          <CardContent>
            <Label htmlFor="objective">Campaign objective</Label>
            <Textarea
              id="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder='e.g. "Win them back with 15% off their favourite roast, code BREW15"'
              className="mt-1.5"
            />

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Primary channel</Label>
                <Select
                  value={primary}
                  onValueChange={(value) => {
                    const channel = value as Channel;
                    setPrimary(channel);
                    setFailover((current) => current.filter((c) => c !== channel));
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {CHANNEL_LABELS[channel]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Failover (in click order)</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CHANNELS.filter((channel) => channel !== primary).map((channel) => {
                    const position = failover.indexOf(channel);
                    return (
                      <button
                        key={channel}
                        onClick={() => toggleFailover(channel)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors',
                          position >= 0
                            ? 'bg-primary text-primary-foreground ring-primary'
                            : 'bg-card text-muted-foreground ring-border hover:text-foreground',
                        )}
                      >
                        {position >= 0 ? `${position + 1} · ` : ''}
                        {CHANNEL_LABELS[channel]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label htmlFor="window">Failover window (min)</Label>
                <Input
                  id="window"
                  type="number"
                  min={5}
                  max={1440}
                  value={windowMinutes}
                  onChange={(event) => setWindowMinutes(Number(event.target.value))}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void draftMessages()}
                disabled={draftBusy || objective.trim().length < 3}
              >
                <Sparkles />
                {draftBusy ? 'Drafting…' : 'Draft message with AI'}
              </Button>
              <span className="text-xs text-muted-foreground">
                or write it yourself below — merge tags: {'{{name}}'}, {'{{city}}'}
              </span>
            </div>
            {draftError && (
              <Alert variant="warning" className="mt-3">
                <AlertDescription>{draftError}</AlertDescription>
              </Alert>
            )}

            {draftBusy && (
              <div className="mt-4" aria-live="polite">
                <p className="shimmer-text text-sm font-medium">
                  ✦ Drafting {CHANNEL_LABELS[primary]} variants…
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3" aria-hidden>
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="space-y-1.5 rounded-lg border p-3">
                      <Skeleton className="h-2 w-full" />
                      <Skeleton className="h-2 w-5/6" />
                      <Skeleton className="h-2 w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drafts.length > 0 && !draftBusy && (
              <div className="mt-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {drafts.map((draft, index) => (
                    <button
                      key={index}
                      onClick={() => setMessage(draft)}
                      className={cn(
                        'relative rounded-lg p-3 text-left text-xs leading-relaxed ring-1 transition',
                        message === draft
                          ? 'bg-accent/5 ring-2 ring-accent'
                          : 'bg-card ring-border hover:ring-accent/50',
                      )}
                    >
                      {message === draft && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      {draft}
                    </button>
                  ))}
                </div>
                {draftModel && (
                  <p className="mt-2 text-xs text-muted-foreground">{formatModel(draftModel)}</p>
                )}
              </div>
            )}

            <Label htmlFor="message" className="mt-5 block">
              Message ({CHANNEL_LABELS[primary]})
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Hi {{name}}, we miss you…"
              className="mt-1.5"
            />

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                maxLength={200}
                placeholder="Campaign name"
                className="w-72"
              />
              <Button
                onClick={() => void createAndLaunch()}
                disabled={launchBusy || campaignName.trim().length === 0 || message.trim().length === 0}
              >
                <Rocket />
                {launchBusy
                  ? 'Launching…'
                  : `Create & launch to ${preview ? preview.count.toLocaleString() : '…'} customers`}
              </Button>
            </div>
            {launchError && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{launchError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
