'use client';

import { ArrowRight, ArrowUp, Check, ChevronDown, Loader2, Plus, Rocket, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import { Skeleton } from '../../components/ui/skeleton';
import { NumberTicker } from '../../components/motion/number-ticker';
import { Grainient } from '../../components/motion/grainient';
import { cn } from '../../lib/utils';

/**
 * Campaign Copilot — the AI-proposes / human-approves flow, shaped as a
 * focused stepper:
 *   describe audience → AI proposes a Segment DSL → marketer edits rules and
 *   sees a live count → saves the segment → AI drafts channel-appropriate
 *   message variants → marketer picks/edits one, sets the failover policy →
 *   create & launch.
 *
 * Layout: one step is large and expanded at a time. Finishing a step collapses
 * it to a clean one-line summary that stacks above, clearing the stage for the
 * next step to expand into. Any collapsed step can be reopened by clicking its
 * summary. So the marketer's attention is always on a single thing, the page
 * never feels like a wall of form fields, and the just-finished work folds
 * quietly out of the way.
 *
 * The audience rules read like a sentence — each condition is "field · operator
 * · value" rendered as quiet, click-to-edit tokens rather than boxed dropdowns.
 *
 * Everything here talks to same-origin /api/* proxy routes; the CRM API key
 * never reaches the browser. Field/op definitions mirror the whitelisted
 * Segment DSL in packages/shared/src/segment-dsl.ts — the server re-validates
 * every document, this UI just keeps the marketer inside the lines.
 */

type Logic = 'AND' | 'OR';
type Step = 'audience' | 'message' | 'delivery';

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
  total_spend: { label: 'Spend', kind: 'number', ops: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'], defaultOp: 'gt', defaultValue: 1000 },
  order_count: { label: 'Orders', kind: 'number', ops: ['gte', 'gt', 'lte', 'lt', 'eq', 'neq'], defaultOp: 'gte', defaultValue: 2 },
  last_order_at: { label: 'Last order', kind: 'days', ops: ['older_than_days', 'within_days'], defaultOp: 'older_than_days', defaultValue: 60 },
  created_at: { label: 'Joined', kind: 'days', ops: ['older_than_days', 'within_days'], defaultOp: 'within_days', defaultValue: 90 },
  city: { label: 'City', kind: 'text', ops: ['eq', 'neq', 'contains'], defaultOp: 'eq', defaultValue: '' },
  tags: { label: 'Tag', kind: 'text', ops: ['includes'], defaultOp: 'includes', defaultValue: '' },
};

// Sentence-friendly operator words (used both in the token and its dropdown).
const OP_WORDS: Record<string, string> = {
  eq: 'is', neq: 'is not', gt: 'over', gte: 'at least', lt: 'under', lte: 'at most',
  older_than_days: 'older than', within_days: 'within last',
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

const EXAMPLES: Array<{ label: string; prompt: string }> = [
  { label: 'Lapsed big spenders', prompt: 'Shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000' },
  { label: 'New, one-time buyers', prompt: 'Customers who joined in the last 30 days and only ordered once' },
  { label: 'Mumbai VIPs', prompt: 'VIPs in Mumbai who have spent over ₹10,000' },
];

// Quiet, borderless token looks shared by the field/operator/value controls.
const TOKEN_SELECT =
  'inline-flex h-auto w-auto items-center gap-0.5 whitespace-nowrap rounded-md border-0 bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground shadow-none transition-colors hover:bg-muted focus:outline-none focus:ring-0 data-[state=open]:bg-muted [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-40';
const TOKEN_VALUE =
  'inline-flex h-auto rounded-md border-0 bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground underline decoration-dashed decoration-muted-foreground/40 underline-offset-4 shadow-none transition-colors hover:bg-muted hover:decoration-muted-foreground focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

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

/** Per-index stagger delay for .rise-in children. */
function riseDelay(index: number, step = 50): React.CSSProperties {
  return { ['--rise-delay' as string]: `${index * step}ms` };
}

/** The numbered/checked marker that anchors every step. */
function StepBadge({ state, n }: { state: 'done' | 'active' | 'todo'; n: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        state === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {n}
    </span>
  );
}

export default function CopilotPage() {
  const router = useRouter();

  // Which step is expanded.
  const [activeStep, setActiveStep] = useState<Step>('audience');

  // Audience intent
  const [prompt, setPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [segmentModel, setSegmentModel] = useState<string | null>(null);
  const [usedNl, setUsedNl] = useState(false);

  // Rules + preview + save
  const [dsl, setDsl] = useState<Dsl | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: SampleCustomer[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [savedSegment, setSavedSegment] = useState<{ id: string; name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Message + channel plan + launch
  const [objective, setObjective] = useState('');
  const [primary, setPrimary] = useState<Channel>('whatsapp');
  const [failover, setFailover] = useState<Channel[]>([]);
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageConfirmed, setMessageConfirmed] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Replays the stagger animation on a fresh proposal, not on every keystroke.
  const [rulesStamp, setRulesStamp] = useState(0);
  const [draftsStamp, setDraftsStamp] = useState(0);

  // Scroll the newly expanded step into view (but never on first paint).
  const activeRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

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

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeStep]);

  async function proposeSegment() {
    if (prompt.trim().length < 3) return;
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
    setRulesStamp((stamp) => stamp + 1);
  }

  function startManually() {
    setDsl({ logic: 'AND', conditions: [{ field: 'order_count', op: 'gte', value: 2 }] });
    setExplanation(null);
    setSegmentModel(null);
    setUsedNl(false);
    setSavedSegment(null);
    setRulesStamp((stamp) => stamp + 1);
  }

  /** Back to the describe box without losing the typed prompt. */
  function redescribe() {
    setDsl(null);
    setExplanation(null);
    setSegmentModel(null);
    setSavedSegment(null);
    setSegmentName('');
    setSaveError(null);
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
    setActiveStep('message');
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
    setDraftsStamp((stamp) => stamp + 1);
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

  const canPropose = !aiBusy && prompt.trim().length >= 3;
  const audienceDone = !!savedSegment;
  const messageReady = message.trim().length > 0;
  const named = campaignName.trim().length > 0;
  const launchReady = audienceDone && messageReady && named;
  const countLabel = preview ? preview.count.toLocaleString() : '—';
  const channelSummary = [primary, ...failover.filter((c) => c !== primary)]
    .map((c) => CHANNEL_LABELS[c])
    .join(' → ');

  /** Reads the value with its unit, e.g. "₹2,000" or "60 days". */
  function valueToken(condition: Condition, index: number) {
    const def = FIELDS[condition.field] ?? FIELDS.total_spend;
    return (
      <span className="inline-flex items-center">
        {condition.field === 'total_spend' && <span className="text-muted-foreground">₹</span>}
        <Input
          aria-label={`${def.label} value`}
          type={def.kind === 'text' ? 'text' : 'number'}
          value={condition.value}
          min={0}
          placeholder={def.kind === 'text' ? 'value' : '0'}
          onChange={(event) =>
            updateCondition(index, {
              ...condition,
              value: def.kind === 'text' ? event.target.value : Number(event.target.value),
            })
          }
          className={cn(TOKEN_VALUE, def.kind === 'text' ? 'w-28' : 'w-16 tabular-nums')}
        />
        {def.kind === 'days' && <span className="text-muted-foreground">days</span>}
      </span>
    );
  }

  // The describe box — only ever shown inside the audience step.
  const composer = (
    <div
      className={cn(
        'group overflow-hidden rounded-2xl border bg-card text-left shadow-lg transition-[border-color,box-shadow] duration-200 focus-within:border-ring/60 focus-within:ring-4 focus-within:ring-ring/10',
        aiBusy && 'ai-thinking',
      )}
    >
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canPropose) void proposeSegment();
          }
        }}
        maxLength={500}
        rows={2}
        spellCheck={false}
        data-1p-ignore
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        placeholder="Describe the audience you want to reach…"
        className="block max-h-40 w-full resize-none border-0 bg-transparent px-4 pb-3 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2.5">
        <button
          onClick={startManually}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Build manually
        </button>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-muted-foreground/70 sm:inline">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">↵</kbd> to send
          </span>
          <button
            onClick={() => void proposeSegment()}
            disabled={!canPropose}
            aria-label="Propose segment"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Ambient grainient — full-bleed behind the whole copilot shell
          (sidebar + header + content) so the chrome reads as frosted glass over
          one continuous moving field. Fixed to the viewport at z-0, below the
          chrome (sidebar z-10 / header z-30) and the content column (z-10). The
          .ambient-mask anchors the light to the top-left, behind the rail and
          header, and dissolves the field into the page toward the bottom-right
          for a composed, directional falloff rather than a clipped rectangle. */}
      <div aria-hidden className="ambient-mask pointer-events-none fixed inset-0 z-0">
        <Grainient className="absolute inset-0 h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl space-y-3 py-1 sm:py-4">
      {/* ───────────────── Step 1 · Audience ───────────────── */}
      {activeStep === 'audience' ? (
        !dsl ? (
          // Empty canvas — an ambient, editorial prompt hero.
          <div
            ref={activeRef}
            className="relative flex min-h-[calc(100dvh-7rem)] flex-col justify-center py-6 md:min-h-[calc(100dvh-5rem)]"
          >
            <div className="relative z-10 mx-auto w-full max-w-2xl text-center">
              <div className="blur-in flex justify-center" style={{ ['--blur-delay' as string]: '0ms' }}>
                <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Campaign Copilot
                </span>
              </div>

              <h1
                className="blur-in mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
                style={{ ['--blur-delay' as string]: '90ms' }}
              >
                Who do you want to{' '}
                <span className="font-editorial font-normal text-foreground/90">reach?</span>
              </h1>

              <p
                className="blur-in mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground"
                style={{ ['--blur-delay' as string]: '180ms' }}
              >
                Describe your audience in plain words. The copilot proposes the rules and drafts the
                message — you stay in control of every one.
              </p>

              <div className="blur-in mt-8" style={{ ['--blur-delay' as string]: '270ms' }}>
                {composer}
              </div>

              <div
                className="blur-in mt-4 flex flex-wrap items-center justify-center gap-2"
                style={{ ['--blur-delay' as string]: '360ms' }}
              >
                <span className="text-xs text-muted-foreground">Try</span>
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    onClick={() => setPrompt(example.prompt)}
                    className="rounded-full border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-foreground/20 hover:text-foreground"
                  >
                    {example.label}
                  </button>
                ))}
              </div>

              {aiError && (
                <Alert variant="warning" className="mt-5 text-left">
                  <AlertDescription>{aiError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        ) : (
          // Active audience: sentence-style rules + live audience + save.
          <section ref={activeRef} className="scroll-mt-20 rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StepBadge state="active" n={1} />
                <h2 className="text-base font-semibold">Audience</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={redescribe} className="text-muted-foreground">
                Start over
              </Button>
            </div>

            {explanation && (
              <div className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p>{explanation}</p>
                  {segmentModel && (
                    <p className="mt-1 text-xs text-muted-foreground/70">{formatModel(segmentModel)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                Customers who match{' '}
                <button
                  onClick={() => setDsl({ ...dsl, logic: dsl.logic === 'AND' ? 'OR' : 'AND' })}
                  className="rounded-md px-1 py-0.5 font-medium text-foreground underline decoration-dashed decoration-muted-foreground/40 underline-offset-4 transition-colors hover:bg-muted hover:decoration-muted-foreground"
                >
                  {dsl.logic === 'AND' ? 'all' : 'any'}
                </button>{' '}
                of these:
              </p>

              <div key={rulesStamp} className="mt-2 divide-y divide-border/60">
                {dsl.conditions.map((condition, index) => {
                  const def = FIELDS[condition.field] ?? FIELDS.total_spend;
                  return (
                    <div
                      key={index}
                      className="rise-in group flex flex-wrap items-center gap-x-1 gap-y-1 py-2"
                      style={riseDelay(index)}
                    >
                      <Select
                        value={condition.field}
                        onValueChange={(field) => {
                          const next = FIELDS[field];
                          updateCondition(index, { field, op: next.defaultOp, value: next.defaultValue });
                        }}
                      >
                        <SelectTrigger className={TOKEN_SELECT} aria-label="Field">
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
                        <SelectTrigger className={TOKEN_SELECT} aria-label="Operator">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {def.ops.map((op) => (
                            <SelectItem key={op} value={op}>
                              {OP_WORDS[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {valueToken(condition, index)}
                      <button
                        onClick={() => removeCondition(index)}
                        aria-label="Remove condition"
                        className="ml-auto rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={addCondition}
                className="mt-1 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add condition
              </button>
            </div>

            {/* Live audience */}
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {preview ? <NumberTicker value={preview.count} /> : '—'}
              </span>
              <span className="text-sm text-muted-foreground">customers match</span>
              {previewBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {preview && preview.sample.length > 0 && (
              <div className="mt-2 divide-y">
                {preview.sample.slice(0, 4).map((customer, index) => (
                  <div
                    key={customer.id}
                    className="rise-in flex items-center justify-between gap-3 py-1.5 first:pt-0"
                    style={riseDelay(index, 30)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer.city ?? '—'} · {customer.orderCount} orders
                      </p>
                    </div>
                    <p className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                      ₹{Number(customer.totalSpend).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {dsl.conditions.length > 0 && (!preview || preview.sample.length === 0) && (
              <p className="mt-2 text-sm text-muted-foreground">
                {previewBusy ? 'Counting…' : 'No matching customers yet — loosen a rule.'}
              </p>
            )}

            <Separator className="my-5" />

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={segmentName}
                onChange={(event) => setSegmentName(event.target.value)}
                maxLength={200}
                data-1p-ignore
                placeholder="Name this segment (e.g. Lapsed big spenders)"
                className="min-w-44 flex-1"
              />
              <Button
                onClick={() => void saveSegment()}
                disabled={saveBusy || segmentName.trim().length === 0 || dsl.conditions.length === 0}
              >
                {saveBusy ? 'Saving…' : 'Save & continue'}
                {!saveBusy && <ArrowRight />}
              </Button>
            </div>
            {saveError && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
          </section>
        )
      ) : (
        // Collapsed audience summary.
        <button
          onClick={() => setActiveStep('audience')}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
        >
          <StepBadge state="done" n={1} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Audience</p>
            <p className="truncate text-xs text-muted-foreground">
              {savedSegment?.name ?? 'Segment'} · {countLabel} customers
            </p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* ───────────────── Step 2 · Message ───────────────── */}
      {dsl &&
        (activeStep === 'message' ? (
          <section ref={activeRef} className="scroll-mt-20 rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <StepBadge state="active" n={2} />
              <h2 className="text-base font-semibold">Message</h2>
            </div>

            {!savedSegment && (
              <Alert variant="warning" className="mt-4">
                <AlertDescription>
                  You edited the rules, so the saved segment is out of date. Reopen Audience and
                  re-save it before launching.
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-4">
              <Label htmlFor="objective">Objective</Label>
              <Input
                id="objective"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                maxLength={500}
                spellCheck={false}
                data-1p-ignore
                placeholder='e.g. "Win them back with 15% off, code BREW15"'
                className="mt-1.5"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void draftMessages()}
                disabled={draftBusy || objective.trim().length < 3}
                className="mt-2.5"
              >
                {draftBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {draftBusy ? `Drafting ${CHANNEL_LABELS[primary]} variants…` : 'Draft with AI'}
              </Button>
            </div>

            {draftError && (
              <Alert variant="warning" className="mt-4">
                <AlertDescription>{draftError}</AlertDescription>
              </Alert>
            )}

            {draftBusy && (
              <div className="mt-4 space-y-2" aria-hidden>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="space-y-1.5 rounded-lg border p-3">
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-2 w-2/3" />
                  </div>
                ))}
              </div>
            )}

            {drafts.length > 0 && !draftBusy && (
              <div key={draftsStamp} className="mt-4 space-y-2">
                {drafts.map((draft, index) => {
                  const selected = message === draft;
                  return (
                    <button
                      key={index}
                      onClick={() => setMessage(draft)}
                      style={riseDelay(index, 60)}
                      className={cn(
                        'rise-in flex w-full items-start gap-3 rounded-lg border p-3 text-left text-[13px] leading-relaxed transition-colors',
                        selected ? 'border-foreground/30 bg-muted/40' : 'hover:bg-muted/30',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          selected
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-muted-foreground/40',
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span>{draft}</span>
                    </button>
                  );
                })}
                {draftModel && <p className="text-xs text-muted-foreground">{formatModel(draftModel)}</p>}
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="message">Message ({CHANNEL_LABELS[primary]})</Label>
                <span className="text-xs text-muted-foreground">
                  merge tags: {'{{name}}'} · {'{{city}}'}
                </span>
              </div>
              <textarea
                id="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={2000}
                rows={3}
                spellCheck={false}
                data-1p-ignore
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                placeholder="Hi {{name}}, we miss you…"
                className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                onClick={() => {
                  setMessageConfirmed(true);
                  setActiveStep('delivery');
                }}
                disabled={!messageReady}
              >
                Continue
                <ArrowRight />
              </Button>
            </div>
          </section>
        ) : audienceDone ? (
          <button
            onClick={() => setActiveStep('message')}
            className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
          >
            <StepBadge state={messageConfirmed ? 'done' : 'todo'} n={2} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Message</p>
              <p className="truncate text-xs text-muted-foreground">
                {messageConfirmed ? `${CHANNEL_LABELS[primary]} · ${message}` : 'Draft or write your message'}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <div className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 opacity-60">
            <StepBadge state="todo" n={2} />
            <p className="text-sm font-medium text-muted-foreground">Message</p>
          </div>
        ))}

      {/* ───────────────── Step 3 · Delivery ───────────────── */}
      {dsl &&
        (activeStep === 'delivery' ? (
          <section ref={activeRef} className="scroll-mt-20 rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <StepBadge state="active" n={3} />
              <h2 className="text-base font-semibold">Delivery</h2>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
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
            <div className="mt-4">
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

            <Separator className="my-5" />

            <div>
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input
                id="campaign-name"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                maxLength={200}
                data-1p-ignore
                placeholder="e.g. June win-back"
                className="mt-1.5"
              />
            </div>

            <Button
              className="mt-5 w-full"
              onClick={() => void createAndLaunch()}
              disabled={!launchReady || launchBusy}
            >
              {launchBusy ? <Loader2 className="animate-spin" /> : <Rocket />}
              {launchBusy ? 'Launching…' : `Launch to ${countLabel} customers`}
            </Button>
            {!launchReady && !launchBusy && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {!audienceDone
                  ? 'Re-save your segment in Audience to launch.'
                  : !named
                    ? 'Name your campaign to launch.'
                    : 'Write your message to launch.'}
              </p>
            )}
            {launchError && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{launchError}</AlertDescription>
              </Alert>
            )}
          </section>
        ) : messageConfirmed ? (
          <button
            onClick={() => setActiveStep('delivery')}
            className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
          >
            <StepBadge state="todo" n={3} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Delivery</p>
              <p className="truncate text-xs text-muted-foreground">{channelSummary}</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <div className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 opacity-60">
            <StepBadge state="todo" n={3} />
            <p className="text-sm font-medium text-muted-foreground">Delivery</p>
          </div>
        ))}
      </div>
    </>
  );
}
