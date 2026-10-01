import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { IcalFeedConfig, IcalFeedStore } from '../../integrations/booking/booking-ical.adapter';
import type { Clock } from '../../infrastructure/clock';

/** Persistence for iCal feed configuration, as seen by the iCal adapter. */
export class PrismaIcalFeedStore implements IcalFeedStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async listActiveFeeds(source: 'BOOKING'): Promise<IcalFeedConfig[]> {
    return this.prisma.icalFeed.findMany({
      where: { source, active: true },
      select: { id: true, name: true, url: true, externalPropertyId: true, externalUnitId: true },
      orderBy: { name: 'asc' },
    });
  }

  async recordFetch(feedId: string, outcome: { ok: true } | { ok: false; error: string }): Promise<void> {
    await this.prisma.icalFeed.update({
      where: { id: feedId },
      data: outcome.ok
        ? { lastFetchedAt: this.clock.now(), lastError: null }
        : { lastError: outcome.error },
    });
  }
}
