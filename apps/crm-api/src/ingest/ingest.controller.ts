import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  customersBatchSchema,
  ordersBatchSchema,
  type CustomersBatch,
  type OrdersBatch,
} from './ingest.schemas';
import { IngestService } from './ingest.service';

@Controller('ingest')
@UseGuards(ApiKeyGuard)
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('customers')
  @HttpCode(200)
  upsertCustomers(@Body(new ZodValidationPipe(customersBatchSchema)) batch: CustomersBatch) {
    return this.ingestService.upsertCustomers(batch);
  }

  @Post('orders')
  @HttpCode(200)
  upsertOrders(@Body(new ZodValidationPipe(ordersBatchSchema)) batch: OrdersBatch) {
    return this.ingestService.upsertOrders(batch);
  }
}
