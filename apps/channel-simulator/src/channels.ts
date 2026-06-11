import { CHANNEL_EVENT_VOCABULARY, type CallbackEventType, type Channel } from '@pulse/shared';
import { z } from 'zod';

/**
 * Per-channel behavior profiles. WhatsApp ≠ SMS ≠ Email ≠ RCS: each has its
 * own latency distribution, failure rate, throughput cap, engagement
 * probabilities, and event vocabulary. All dials are runtime-tunable via the
 * admin config endpoint (the chaos panel) — defaults are intentionally
 * "realistic vendor", not "perfect vendor".
 */

export interface ChannelProfile {
  /** Delivery latency drawn uniformly from [minMs, maxMs]. */
  latencyMinMs: number;
  latencyMaxMs: number;
  /** Probability a message hard-fails instead of delivering. */
  failureRate: number;
  /** Token-bucket throughput cap (messages/second) and burst size. */
  ratePerSec: number;
  burst: number;
  /** P(opened|delivered) or P(read|delivered) depending on vocabulary. */
  engagementRate: number;
  /** P(clicked|engaged) — or P(clicked|delivered) for SMS (no read/open). */
  clickRate: number;
}

export interface ChaosProfile {
  /** Probability an emitted event is sent twice (same event_id). */
  duplicateRate: number;
  /** Probability an event's dispatch is delayed past its successors. */
  outOfOrderRate: number;
}

export const DEFAULT_CHANNEL_PROFILES: Record<Channel, ChannelProfile> = {
  whatsapp: {
    latencyMinMs: 300,
    latencyMaxMs: 2500,
    failureRate: 0.06,
    ratePerSec: 25,
    burst: 50,
    engagementRate: 0.65,
    clickRate: 0.25,
  },
  sms: {
    latencyMinMs: 500,
    latencyMaxMs: 5000,
    failureRate: 0.04,
    ratePerSec: 100,
    burst: 200,
    engagementRate: 0,
    clickRate: 0.08,
  },
  email: {
    latencyMinMs: 1000,
    latencyMaxMs: 10000,
    failureRate: 0.02,
    ratePerSec: 200,
    burst: 400,
    engagementRate: 0.35,
    clickRate: 0.12,
  },
  rcs: {
    latencyMinMs: 400,
    latencyMaxMs: 3000,
    failureRate: 0.08,
    ratePerSec: 30,
    burst: 60,
    engagementRate: 0.55,
    clickRate: 0.2,
  },
};

export const DEFAULT_CHAOS: ChaosProfile = {
  duplicateRate: 0.05,
  outOfOrderRate: 0.1,
};

const rate = z.number().min(0).max(1);

export const channelProfileSchema = z.object({
  latencyMinMs: z.number().int().min(0).max(60_000),
  latencyMaxMs: z.number().int().min(0).max(120_000),
  failureRate: rate,
  ratePerSec: z.number().min(0.1).max(10_000),
  burst: z.number().int().min(1).max(50_000),
  engagementRate: rate,
  clickRate: rate,
});

export const simulatorConfigSchema = z.object({
  channels: z.record(z.enum(['whatsapp', 'sms', 'email', 'rcs']), channelProfileSchema.partial()).optional(),
  chaos: z.object({ duplicateRate: rate, outOfOrderRate: rate }).partial().optional(),
});
export type SimulatorConfigPatch = z.infer<typeof simulatorConfigSchema>;

/** Mutable runtime state — this is what the chaos panel turns. */
export class SimulatorState {
  readonly channels: Record<Channel, ChannelProfile>;
  chaos: ChaosProfile;

  constructor() {
    this.channels = structuredClone(DEFAULT_CHANNEL_PROFILES);
    this.chaos = { ...DEFAULT_CHAOS };
  }

  apply(patch: SimulatorConfigPatch): void {
    if (patch.channels) {
      for (const [channel, profile] of Object.entries(patch.channels)) {
        Object.assign(this.channels[channel as Channel], profile);
      }
    }
    if (patch.chaos) {
      Object.assign(this.chaos, patch.chaos);
    }
  }

  snapshot() {
    return { channels: this.channels, chaos: this.chaos };
  }
}

/**
 * Plans the realistic event lifecycle for one accepted message: failure or
 * delivery after channel latency, then engagement (opened/read per the
 * channel's vocabulary), then click. Returns events with absolute timestamps.
 */
export function planLifecycle(
  channel: Channel,
  profile: ChannelProfile,
  now: number,
  random: () => number = Math.random,
): Array<{ event: CallbackEventType; at: number }> {
  const vocabulary = CHANNEL_EVENT_VOCABULARY[channel];
  const latency =
    profile.latencyMinMs + random() * Math.max(0, profile.latencyMaxMs - profile.latencyMinMs);
  const deliveredAt = now + latency;

  if (random() < profile.failureRate) {
    return [{ event: 'failed', at: deliveredAt }];
  }

  const events: Array<{ event: CallbackEventType; at: number }> = [
    { event: 'delivered', at: deliveredAt },
  ];

  const engagementEvent = vocabulary.includes('read')
    ? 'read'
    : vocabulary.includes('opened')
      ? 'opened'
      : undefined;

  let lastAt = deliveredAt;
  let engaged = false;
  if (engagementEvent && random() < profile.engagementRate) {
    lastAt = deliveredAt + 2000 + random() * 30_000;
    events.push({ event: engagementEvent, at: lastAt });
    engaged = true;
  }

  // SMS has no engagement event; clicks come straight off delivery.
  const clickEligible = engagementEvent ? engaged : true;
  if (vocabulary.includes('clicked') && clickEligible && random() < profile.clickRate) {
    events.push({ event: 'clicked', at: lastAt + 1500 + random() * 20_000 });
  }

  return events;
}
