import { Controller, Delete, Get, Header, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUserService } from '../users/current-user.service';
import { CalendarExportService } from './calendar-export.service';

/** Managing the outgoing links (used by the app). */
@Controller('calendar-exports')
export class CalendarExportsController {
  constructor(
    private readonly exports: CalendarExportService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get()
  list() {
    return this.exports.list();
  }

  /** Creates the link, or replaces it (the old one stops working). */
  @Post(':unitId')
  async enable(@Param('unitId', ParseUUIDPipe) unitId: string) {
    return this.exports.enable(unitId, await this.currentUser.id());
  }

  @Delete(':unitId')
  async disable(@Param('unitId', ParseUUIDPipe) unitId: string) {
    return this.exports.disable(unitId, await this.currentUser.id());
  }
}

/**
 * The public calendar file, fetched by Booking.com: /api/calendar-export/<token>.ics
 * The only route meant to be reachable from the internet (see "Skill - Publish Calendars to Booking").
 */
@Controller('calendar-export')
export class CalendarExportFileController {
  constructor(private readonly exports: CalendarExportService) {}

  @Get(':file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  render(@Param('file') file: string) {
    if (!file.endsWith('.ics')) throw new NotFoundException();
    return this.exports.render(file.slice(0, -'.ics'.length));
  }
}
