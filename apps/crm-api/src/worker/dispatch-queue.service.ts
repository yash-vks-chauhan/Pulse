import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

export const DISPATCH_QUEUE = 'dispatch';
export const DISPATCH_DLQ = 'dispatch-dlq';

export interface DispatchJobData {
  campaignId: string;
  communicationIds: string[];
  /** Incremented each time the simulator throttles this batch. */
  throttleAttempt?: number;
}

const MAX_SEND_ATTEMPTS = 5;

/**
 * BullMQ wiring. One shared Redis connection config; jobs retry with
 * exponential backoff and land in an explicit dead-letter queue when
 * exhausted — failures are visible, never silent.
 */
@Injectable()
export class DispatchQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(DispatchQueueService.name);
  readonly connection: IORedis;
  readonly queue: Queue<DispatchJobData>;
  readonly dlq: Queue<DispatchJobData & { reason: string }>;

  constructor() {
    this.connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(DISPATCH_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: MAX_SEND_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    });
    this.dlq = new Queue(DISPATCH_DLQ, { connection: this.connection });
  }

  async enqueue(data: DispatchJobData, delayMs = 0): Promise<void> {
    await this.queue.add('dispatch-batch', data, delayMs > 0 ? { delay: delayMs } : undefined);
  }

  async deadLetter(data: DispatchJobData, reason: string): Promise<void> {
    this.logger.warn(`Dead-lettering batch of ${data.communicationIds.length}: ${reason}`);
    await this.dlq.add('dead-letter', { ...data, reason });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.dlq.close();
    this.connection.disconnect();
  }
}
