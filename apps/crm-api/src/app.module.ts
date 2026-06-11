import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { InsightsModule } from './insights/insights.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { SegmentsModule } from './segments/segments.module';
import { WorkerModule } from './worker/worker.module';

@Module({
  imports: [
    // Global rate limit: 300 requests/min per client (receipts webhooks
    // included — the simulator batches events, so this is generous).
    // The AI controller overrides this with a far tighter 10/min cap.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    WorkerModule,
    IngestModule,
    ReceiptsModule,
    SegmentsModule,
    AiModule,
    CampaignsModule,
    InsightsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
