import { Injectable, Logger } from '@nestjs/common';
import {
  STATUS_RANK,
  type CommunicationStatus,
  type ReceiptsRequest,
  type ReceiptsResponse,
} from '@pulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { planReceiptBatch } from './receipts.logic';

/**
 * Receipt ingestion: append events to the immutable event log, advance each
 * communication's status forward-only. Duplicates are absorbed twice over —
 * in-batch by the planner, cross-batch by the unique idempotency_key
 * constraint (createMany + skipDuplicates).
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(request: ReceiptsRequest): Promise<ReceiptsResponse> {
    const messageIds = [...new Set(request.events.map((event) => event.message_id))];
    const communications = await this.prisma.communication.findMany({
      where: { id: { in: messageIds } },
      select: { id: true, status: true },
    });
    const currentStatusById = new Map<string, CommunicationStatus>(
      communications.map((comm) => [comm.id, comm.status as CommunicationStatus]),
    );

    const plan = planReceiptBatch(request.events, currentStatusById);

    // Append to the event log; the unique idempotency_key absorbs duplicates
    // that arrived in *earlier* batches.
    const { count: inserted } = await this.prisma.commEvent.createMany({
      data: plan.inserts,
      skipDuplicates: true,
    });
    const crossBatchDuplicates = plan.inserts.length - inserted;

    // Forward-only status advance, guarded again at the database level: the
    // rank predicate makes concurrent updates safe (last writer still never
    // downgrades).
    const now = new Date();
    for (const [communicationId, status] of plan.statusUpdates) {
      await this.prisma.communication.updateMany({
        where: { id: communicationId, statusRank: { lt: STATUS_RANK[status] } },
        data: { status, statusRank: STATUS_RANK[status], lastEventAt: now },
      });
    }

    const response: ReceiptsResponse = {
      accepted: inserted,
      duplicates: plan.inBatchDuplicates + crossBatchDuplicates,
      unknown: plan.unknown,
    };
    this.logger.log(
      `Receipts: accepted=${response.accepted} duplicates=${response.duplicates} unknown=${response.unknown}`,
    );
    return response;
  }
}
