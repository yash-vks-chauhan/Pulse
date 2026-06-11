import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

export const FAILOVER_QUEUE = 'failover';

export interface FailoverJobData {
  campaignId: string;
  /** Index into the campaign's channel sequence this sweep inspects. */
  hop: number;
}

/**
 * Delayed failover sweeps. Each (campaign, hop) pair gets a deterministic
 * job id, so re-scheduling the same sweep — a retried launch, a concurrent
 * worker — is a no-op instead of a duplicate escalation pass.
 */
@Injectable()
export class FailoverQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(FailoverQueueService.name);
  readonly connection: IORedis;
  readonly queue: Queue<FailoverJobData>;

  constructor() {
    this.connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(FAILOVER_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
    });
  }

  async scheduleSweep(data: FailoverJobData, delayMs: number): Promise<void> {
    this.logger.log(
      `Scheduling failover sweep for campaign ${data.campaignId} hop ${data.hop} in ${Math.round(delayMs / 1000)}s`,
    );
    await this.queue.add('sweep', data, {
      delay: delayMs,
      jobId: `sweep:${data.campaignId}:${data.hop}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
