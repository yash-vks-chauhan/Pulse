import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  buildSignatureHeaders,
  sendResponseSchema,
  STATUS_RANK,
  type Channel,
  type SendMessage,
  type SendRequest,
} from '@pulse/shared';
import { Job, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PiiCrypto } from '../common/pii-crypto';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISPATCH_QUEUE,
  DispatchQueueService,
  type DispatchJobData,
} from './dispatch-queue.service';

const CONCURRENCY = 4;
const SEND_TIMEOUT_MS = 10_000;
const MAX_THROTTLE_ATTEMPTS = 8;
const THROTTLE_BASE_DELAY_MS = 1000;
const THROTTLE_MAX_DELAY_MS = 30_000;

function readErrorField(error: unknown, field: string): string | undefined {
  if (!error || typeof error !== 'object' || !(field in error)) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  const causeCode = readErrorField(cause, 'code');
  const causeMessage = readErrorField(cause, 'message');
  const details = [causeCode, causeMessage].filter(Boolean).join(': ');
  return details ? `${error.name}: ${error.message}; cause=${details}` : `${error.name}: ${error.message}`;
}

/**
 * Campaign dispatch worker. Pulls batches of QUEUED communications, decrypts
 * recipients just-in-time, and sends them to the channel simulator over the
 * HMAC-signed /send API.
 *
 *  - Throttled messages → re-enqueued with exponential backoff + jitter
 *  - Transport failures → BullMQ retry (exponential backoff), then DLQ
 *  - Status updates are rank-guarded, so a receipt that already arrived
 *    can never be overwritten backwards by our own SENT mark
 */
@Injectable()
export class DispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchWorker.name);
  private readonly pii = new PiiCrypto(config.piiEncryptionKey, config.piiHashKey);
  private worker: Worker<DispatchJobData> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: DispatchQueueService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<DispatchJobData>(
      DISPATCH_QUEUE,
      (job) => this.process(job),
      {
        connection: this.queueService.connection,
        concurrency: CONCURRENCY,
      },
    );

    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      this.logger.warn(
        `Dispatch job ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`,
      );
      if (exhausted) {
        void this.handleExhausted(job.data, error.message);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<DispatchJobData>): Promise<void> {
    const { communicationIds } = job.data;

    const communications = await this.prisma.communication.findMany({
      where: { id: { in: communicationIds }, status: 'QUEUED' },
      select: {
        id: true,
        channel: true,
        messageRendered: true,
        customer: { select: { emailEnc: true, phoneEnc: true } },
      },
    });
    if (communications.length === 0) return;

    const messages: SendMessage[] = [];
    const unreachable: string[] = [];
    for (const comm of communications) {
      const encrypted =
        comm.channel === 'email' ? comm.customer.emailEnc : comm.customer.phoneEnc;
      if (!encrypted) {
        unreachable.push(comm.id);
        continue;
      }
      messages.push({
        message_id: comm.id,
        channel: comm.channel as Channel,
        recipient: this.pii.decrypt(encrypted),
        body: comm.messageRendered,
      });
    }
    if (unreachable.length > 0) {
      await this.markFailed(unreachable, 'no_contact_for_channel');
    }
    if (messages.length === 0) return;

    const request: SendRequest = {
      batch_id: randomUUID(),
      messages,
      callback_url: `${config.crmPublicUrl}/api/receipts`,
    };
    const body = JSON.stringify(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${config.simulatorUrl}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...buildSignatureHeaders(config.hmacSecret, body),
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `simulator /send fetch failed for ${new URL(config.simulatorUrl).origin} (${describeFetchError(error)})`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status !== 202) {
      // Throw → BullMQ retries with backoff; DLQ after final attempt.
      throw new Error(`simulator /send returned ${response.status}`);
    }

    const result = sendResponseSchema.parse(await response.json());

    if (result.accepted.length > 0) {
      // Rank guard: a fast receipt may already have advanced this row.
      await this.prisma.communication.updateMany({
        where: { id: { in: result.accepted }, statusRank: { lt: STATUS_RANK.SENT } },
        data: { status: 'SENT', statusRank: STATUS_RANK.SENT, sentAt: new Date() },
      });
      await this.prisma.communication.updateMany({
        where: { id: { in: result.accepted } },
        data: { attempt: { increment: 1 } },
      });
    }

    if (result.rejected.length > 0) {
      await this.markFailed(
        result.rejected.map((r) => r.message_id),
        'rejected_by_vendor',
      );
    }

    if (result.throttled.length > 0) {
      await this.requeueThrottled(job.data, result.throttled);
    }
  }

  /** Vendor said "slow down": re-enqueue just the throttled ids with backoff. */
  private async requeueThrottled(data: DispatchJobData, throttledIds: string[]): Promise<void> {
    const throttleAttempt = (data.throttleAttempt ?? 0) + 1;
    if (throttleAttempt > MAX_THROTTLE_ATTEMPTS) {
      await this.queueService.deadLetter(
        { ...data, communicationIds: throttledIds, throttleAttempt },
        'throttle_attempts_exhausted',
      );
      await this.markFailed(throttledIds, 'throttle_attempts_exhausted');
      return;
    }
    const backoff = Math.min(
      THROTTLE_MAX_DELAY_MS,
      THROTTLE_BASE_DELAY_MS * 2 ** (throttleAttempt - 1),
    );
    const jitter = Math.random() * backoff * 0.25;
    this.logger.log(
      `Throttled ${throttledIds.length} messages; retry #${throttleAttempt} in ~${Math.round(backoff + jitter)}ms`,
    );
    await this.queueService.enqueue(
      { campaignId: data.campaignId, communicationIds: throttledIds, throttleAttempt },
      backoff + jitter,
    );
  }

  private async handleExhausted(data: DispatchJobData, reason: string): Promise<void> {
    await this.queueService.deadLetter(data, reason);
    await this.markFailed(data.communicationIds, `dispatch_exhausted: ${reason}`);
  }

  private async markFailed(ids: string[], reason: string): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.communication.updateMany({
      where: { id: { in: ids }, statusRank: { lt: STATUS_RANK.FAILED } },
      data: { status: 'FAILED', statusRank: STATUS_RANK.FAILED, failureReason: reason },
    });
  }
}
