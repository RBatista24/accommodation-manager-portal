import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import type { ReservationSource } from '../../domain/reservation';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BookingIcalAdapter } from '../../integrations/booking/booking-ical.adapter';
import { BookingMockAdapter } from '../../integrations/booking/booking-mock.adapter';
import type { ReservationSourceAdapter } from '../../integrations/reservation-source-adapter';
import { presentSyncRun } from '../sync/sync-run.presenter';
import { SyncService } from '../sync/sync.service';
import { PrismaIcalFeedStore } from './prisma-ical-feed-store';

/** Reservation sources enabled in this version. Airbnb/Direct come in later phases. */
export const ENABLED_SOURCES: readonly ReservationSource[] = ['BOOKING'];

export function parseSourceParam(value: string): ReservationSource {
  const source = value.toUpperCase() as ReservationSource;
  if (!ENABLED_SOURCES.includes(source)) {
    throw new NotFoundException(`The integration "${value}" is not available in this version.`);
  }
  return source;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The adapter registry: which implementation serves each source. */
  adapterFor(source: ReservationSource): ReservationSourceAdapter {
    switch (source) {
      case 'BOOKING':
        return this.config.bookingMode === 'ical'
          ? new BookingIcalAdapter(new PrismaIcalFeedStore(this.prisma, this.clock))
          : new BookingMockAdapter();
      default:
        throw new NotFoundException(`The integration "${source}" is not available in this version.`);
    }
  }

  async list() {
    return Promise.all(ENABLED_SOURCES.map((s) => this.status(s)));
  }

  async status(source: ReservationSource) {
    const adapter = this.adapterFor(source);
    const [description, lastRun, lastSuccess, mappingCount, roomsWithoutUnit, running] = await Promise.all([
      adapter.describe(),
      this.prisma.syncRun.findFirst({ where: { source }, orderBy: { startedAt: 'desc' } }),
      this.prisma.syncRun.findFirst({
        where: { source, status: { in: ['SUCCESS', 'PARTIAL'] } },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.sourceMapping.count({ where: { source, active: true } }),
      this.prisma.sourceMapping.count({ where: { source, active: true, unitId: null } }),
      this.prisma.syncRun.count({ where: { source, status: 'RUNNING' } }),
    ]);

    return {
      source,
      mode: adapter.mode,
      configured: description.configured,
      summary: description.summary,
      details: description.details,
      syncing: running > 0,
      lastSync: lastRun ? presentSyncRun(lastRun) : null,
      lastSuccessfulSyncAt: lastSuccess?.finishedAt?.toISOString() ?? null,
      mappings: { total: mappingCount, withoutUnit: roomsWithoutUnit },
    };
  }

  async runSync(source: ReservationSource) {
    const run = await this.sync.run(this.adapterFor(source));
    return presentSyncRun(run);
  }
}
