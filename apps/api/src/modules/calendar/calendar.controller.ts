import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { CalendarService } from './calendar.service';

class CalendarQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;
}

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** GET /calendar?from=2026-09-28&to=2026-10-05[&propertyId=...] ; "to" is exclusive. */
  @Get()
  get(@Query() query: CalendarQuery) {
    return this.calendar.get(query);
  }
}
