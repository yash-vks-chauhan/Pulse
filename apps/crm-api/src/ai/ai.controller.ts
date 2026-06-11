import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  draftRequestSchema,
  nlSegmentRequestSchema,
  type DraftRequest,
  type NlSegmentRequest,
} from './ai.schemas';
import { AiService } from './ai.service';

/**
 * AI endpoints are key-guarded like every write surface, and additionally
 * rate-limited far below the global limit — each call spends real money on
 * LLM tokens, so abuse caps are tighter here (10/min per client).
 */
@Controller('ai')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('segment')
  @HttpCode(200)
  nlToSegment(@Body(new ZodValidationPipe(nlSegmentRequestSchema)) input: NlSegmentRequest) {
    return this.aiService.nlToSegment(input);
  }

  @Post('draft')
  @HttpCode(200)
  draft(@Body(new ZodValidationPipe(draftRequestSchema)) input: DraftRequest) {
    return this.aiService.draftMessages(input);
  }
}
