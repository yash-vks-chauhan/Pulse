import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [AiModule, CampaignsModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
