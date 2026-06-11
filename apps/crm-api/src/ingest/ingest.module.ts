import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [InsightsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
