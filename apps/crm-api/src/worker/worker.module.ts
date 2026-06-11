import { Module } from '@nestjs/common';
import { DispatchQueueService } from './dispatch-queue.service';
import { DispatchWorker } from './dispatch.worker';
import { FailoverQueueService } from './failover-queue.service';
import { FailoverWorker } from './failover.worker';

@Module({
  providers: [DispatchQueueService, DispatchWorker, FailoverQueueService, FailoverWorker],
  exports: [DispatchQueueService, FailoverQueueService],
})
export class WorkerModule {}
