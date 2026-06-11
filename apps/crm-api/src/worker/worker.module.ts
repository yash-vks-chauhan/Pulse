import { Module } from '@nestjs/common';
import { DispatchQueueService } from './dispatch-queue.service';
import { DispatchWorker } from './dispatch.worker';

@Module({
  providers: [DispatchQueueService, DispatchWorker],
  exports: [DispatchQueueService],
})
export class WorkerModule {}
