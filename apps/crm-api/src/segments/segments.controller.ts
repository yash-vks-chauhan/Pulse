import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createSegmentSchema,
  previewSegmentSchema,
  type CreateSegment,
  type PreviewSegment,
} from './segments.schemas';
import { SegmentsService } from './segments.service';

@Controller('segments')
@UseGuards(ApiKeyGuard)
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createSegmentSchema)) input: CreateSegment) {
    return this.segmentsService.create(input);
  }

  /** Stateless preview — compile the (validated) DSL and report count + sample. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body(new ZodValidationPipe(previewSegmentSchema)) input: PreviewSegment) {
    return this.segmentsService.preview(input);
  }

  @Get()
  list() {
    return this.segmentsService.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentsService.get(id);
  }
}
