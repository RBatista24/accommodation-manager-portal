import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { DashboardService } from './dashboard.service';

class DashboardQuery {
  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query() query: DashboardQuery) {
    return this.dashboard.get(query.propertyId);
  }
}
