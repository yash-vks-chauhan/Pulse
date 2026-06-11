import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { followUpRequestSchema, type FollowUpRequest } from './insights.schemas';
import { InsightsService } from './insights.service';

/**
 * Insights can trigger an LLM call (the narrative), so the rate cap sits well
 * below the global limit — these are read-once views, not polling targets.
 */
@Controller('insights')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get(':campaignId')
  insights(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.insightsService.campaignInsights(campaignId);
  }

  @Post(':campaignId/follow-up')
  @HttpCode(201)
  followUp(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body(new ZodValidationPipe(followUpRequestSchema)) input: FollowUpRequest,
  ) {
    return this.insightsService.createFollowUp(campaignId, input);
  }
}
