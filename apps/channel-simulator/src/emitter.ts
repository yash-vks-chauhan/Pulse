import {
  buildSignatureHeaders,
  type CallbackEvent,
  type CallbackEventType,
  type Channel,
} from '@pulse/shared';
import { randomUUID } from 'node:crypto';
import { planLifecycle, type SimulatorState } from './channels';

/**
 * The callback engine. Accepted messages get a planned lifecycle; events sit
 * in an in-memory outbox until due, then are flushed in batches to the CRM's
 * receipts webhook with HMAC-signed requests.
 *
 * Chaos behaviors (all tunable at runtime):
 *  - duplicates: an event is emitted twice with the SAME event_id, so the
 *    CRM's idempotency layer is genuinely exercised
 *  - out-of-order: an event's dispatch is delayed past its successors
 *  - webhook retry: failed deliveries retry with exponential backoff + jitter,
 *    simulating real vendor webhook behavior when the CRM is down
 */

interface OutboxEntry {
  dueAt: number;
  attempt: number;
  callbackUrl: string;
  event: CallbackEvent;
}

const FLUSH_INTERVAL_MS = 250;
const MAX_BATCH = 200;
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 1000;
const CALLBACK_TIMEOUT_MS = 5000;

export class CallbackEmitter {
  private outbox: OutboxEntry[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushing = false;
  readonly stats = { emitted: 0, duplicatesInjected: 0, retries: 0, dropped: 0 };

  constructor(
    private readonly state: SimulatorState,
    private readonly hmacSecret: string,
    private readonly allowlist: string[],
  ) {}

  /** SSRF guard: callbacks only ever go to explicitly allowlisted origins. */
  isAllowedCallbackUrl(url: string): boolean {
    try {
      const origin = new URL(url).origin;
      return this.allowlist.includes(origin);
    } catch {
      return false;
    }
  }

  schedule(messageId: string, channel: Channel, callbackUrl: string): void {
    const profile = this.state.channels[channel];
    const lifecycle = planLifecycle(channel, profile, Date.now());
    for (const { event, at } of lifecycle) {
      this.push(messageId, channel, event, at, callbackUrl);
    }
  }

  private push(
    messageId: string,
    channel: Channel,
    eventType: CallbackEventType,
    dueAt: number,
    callbackUrl: string,
  ): void {
    const { duplicateRate, outOfOrderRate } = this.state.chaos;
    const event: CallbackEvent = {
      event_id: randomUUID(),
      message_id: messageId,
      event: eventType,
      channel,
      ts: new Date(dueAt).toISOString(),
    };

    // Out-of-order injection: hold this event back so a successor overtakes it.
    const delay = Math.random() < outOfOrderRate ? 5000 + Math.random() * 20_000 : 0;
    this.outbox.push({ dueAt: dueAt + delay, attempt: 0, callbackUrl, event });

    // Duplicate injection: same event_id, slightly later — must be deduped.
    if (Math.random() < duplicateRate) {
      this.stats.duplicatesInjected++;
      this.outbox.push({
        dueAt: dueAt + delay + 1000 + Math.random() * 10_000,
        attempt: 0,
        callbackUrl,
        event,
      });
    }
  }

  start(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  pendingCount(): number {
    return this.outbox.length;
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const now = Date.now();
      const due = this.outbox.filter((entry) => entry.dueAt <= now).slice(0, MAX_BATCH);
      if (due.length === 0) return;
      this.outbox = this.outbox.filter((entry) => !due.includes(entry));

      const byUrl = new Map<string, OutboxEntry[]>();
      for (const entry of due) {
        const list = byUrl.get(entry.callbackUrl) ?? [];
        list.push(entry);
        byUrl.set(entry.callbackUrl, list);
      }

      await Promise.all(
        [...byUrl.entries()].map(([url, entries]) => this.deliver(url, entries)),
      );
    } finally {
      this.flushing = false;
    }
  }

  private async deliver(callbackUrl: string, entries: OutboxEntry[]): Promise<void> {
    const body = JSON.stringify({ events: entries.map((entry) => entry.event) });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...buildSignatureHeaders(this.hmacSecret, body),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`receipts endpoint returned ${response.status}`);
      this.stats.emitted += entries.length;
    } catch (error) {
      this.requeue(entries, error);
    }
  }

  /** Webhook retry with exponential backoff + jitter; drop after MAX_ATTEMPTS. */
  private requeue(entries: OutboxEntry[], error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    for (const entry of entries) {
      entry.attempt += 1;
      if (entry.attempt >= MAX_ATTEMPTS) {
        this.stats.dropped++;
        console.error(
          `[emitter] dropping event ${entry.event.event_id} after ${entry.attempt} attempts: ${reason}`,
        );
        continue;
      }
      this.stats.retries++;
      const backoff = RETRY_BASE_MS * 2 ** entry.attempt;
      entry.dueAt = Date.now() + backoff + Math.random() * backoff * 0.25;
      this.outbox.push(entry);
    }
  }
}
