import { CHANNEL_EVENT_VOCABULARY, CHANNELS } from '@pulse/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHANNEL_PROFILES, planLifecycle, SimulatorState } from './channels';
import { TokenBucket } from './throttle';

describe('planLifecycle', () => {
  it('emits only events in the channel vocabulary', () => {
    for (const channel of CHANNELS) {
      for (let i = 0; i < 200; i++) {
        const events = planLifecycle(channel, DEFAULT_CHANNEL_PROFILES[channel], Date.now());
        for (const { event } of events) {
          expect(CHANNEL_EVENT_VOCABULARY[channel]).toContain(event);
        }
      }
    }
  });

  it('never emits read for SMS or opened for WhatsApp', () => {
    for (let i = 0; i < 500; i++) {
      const sms = planLifecycle('sms', DEFAULT_CHANNEL_PROFILES.sms, 0);
      expect(sms.some((e) => e.event === 'read' || e.event === 'opened')).toBe(false);
      const wa = planLifecycle('whatsapp', DEFAULT_CHANNEL_PROFILES.whatsapp, 0);
      expect(wa.some((e) => e.event === 'opened')).toBe(false);
    }
  });

  it('a failed message emits exactly one failed event and nothing else', () => {
    const profile = { ...DEFAULT_CHANNEL_PROFILES.whatsapp, failureRate: 1 };
    const events = planLifecycle('whatsapp', profile, 0);
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('failed');
  });

  it('with zero failure and full engagement, whatsapp reaches clicked in order', () => {
    const profile = {
      ...DEFAULT_CHANNEL_PROFILES.whatsapp,
      failureRate: 0,
      engagementRate: 1,
      clickRate: 1,
    };
    const events = planLifecycle('whatsapp', profile, 0);
    expect(events.map((e) => e.event)).toEqual(['delivered', 'read', 'clicked']);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.at).toBeGreaterThanOrEqual(events[i - 1]!.at);
    }
  });
});

describe('TokenBucket', () => {
  it('caps at burst and refills over time', () => {
    let now = 0;
    const bucket = new TokenBucket(10, 5, () => now);
    expect(bucket.take(5)).toBe(true);
    expect(bucket.take(1)).toBe(false);
    now += 1000; // +10 tokens, capped at 5
    expect(bucket.available()).toBe(5);
    expect(bucket.take(5)).toBe(true);
  });

  it('throttles a burst beyond capacity', () => {
    let now = 0;
    const bucket = new TokenBucket(2, 3, () => now);
    const results = Array.from({ length: 5 }, () => bucket.take());
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});

describe('SimulatorState', () => {
  it('applies partial chaos patches without losing other settings', () => {
    const state = new SimulatorState();
    state.apply({ chaos: { duplicateRate: 0.5 } });
    expect(state.chaos.duplicateRate).toBe(0.5);
    expect(state.chaos.outOfOrderRate).toBeGreaterThan(0);
    state.apply({ channels: { whatsapp: { failureRate: 0.4 } } });
    expect(state.channels.whatsapp.failureRate).toBe(0.4);
    expect(state.channels.whatsapp.ratePerSec).toBe(25);
  });
});
