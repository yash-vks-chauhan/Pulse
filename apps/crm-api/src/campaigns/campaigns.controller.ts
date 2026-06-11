import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createCampaignSchema, type CreateCampaign } from './campaigns.schemas';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
@UseGuards(ApiKeyGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createCampaignSchema)) input: CreateCampaign) {
    return this.campaignsService.create(input);
  }

  @Get()
  list() {
    return this.campaignsService.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.get(id);
  }

  @Post(':id/launch')
  @HttpCode(200)
  launch(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.launch(id);
  }

  @Get(':id/stats')
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.stats(id);
  }
}
