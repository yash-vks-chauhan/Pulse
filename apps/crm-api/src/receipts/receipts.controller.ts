import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { receiptsRequestSchema, type ReceiptsRequest } from '@pulse/shared';
import { HmacGuard } from '../common/hmac.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReceiptsService } from './receipts.service';

@Controller('receipts')
@UseGuards(HmacGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  /** Simulator → CRM delivery callbacks. HMAC-signed, idempotent. */
  @Post()
  @HttpCode(200)
  ingest(@Body(new ZodValidationPipe(receiptsRequestSchema)) request: ReceiptsRequest) {
    return this.receiptsService.ingest(request);
  }
}
