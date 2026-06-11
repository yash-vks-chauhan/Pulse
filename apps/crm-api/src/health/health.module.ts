import { Module } from '@nestjs/common';
import { WorkerModule } from '../worker/worker.module';
import { HealthController } from './health.controller';

@Module({
  imports: [WorkerModule],
  controllers: [HealthController],
})
export class HealthModule {}
