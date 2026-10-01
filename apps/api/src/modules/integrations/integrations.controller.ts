import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IntegrationsService, parseSourceParam } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list() {
    return this.integrations.list();
  }

  /** e.g. GET /integrations/booking */
  @Get(':source')
  status(@Param('source') source: string) {
    return this.integrations.status(parseSourceParam(source));
  }

  /** e.g. POST /integrations/booking/sync  ("Sync Booking") */
  @Post(':source/sync')
  @HttpCode(200)
  sync(@Param('source') source: string) {
    return this.integrations.runSync(parseSourceParam(source));
  }
}
