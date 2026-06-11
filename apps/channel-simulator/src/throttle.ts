/**
 * Token bucket per channel. Capacity = burst, refilled at ratePerSec.
 * `take()` is all-or-nothing per message — a throttled message is reported
 * back to the CRM, which re-enqueues it with backoff (real vendor behavior).
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private ratePerSec: number,
    private capacity: number,
    private now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = this.now();
  }

  configure(ratePerSec: number, capacity: number): void {
    this.refill();
    this.ratePerSec = ratePerSec;
    this.capacity = capacity;
    this.tokens = Math.min(this.tokens, capacity);
  }

  take(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const nowMs = this.now();
    const elapsedSec = (nowMs - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.ratePerSec);
      this.lastRefill = nowMs;
    }
  }
}
