import 'reflect-metadata';
import type { NormalizedReservation } from '../src/domain/reservation';
import type { SnapshotScope } from '../src/domain/snapshot-cancellation';
import { FixedClock } from '../src/infrastructure/clock';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import type { FetchResult, ReservationSourceAdapter } from '../src/integrations/reservation-source-adapter';
import { AuditService } from '../src/modules/audit/audit.service';
import { MappingsService } from '../src/modules/mappings/mappings.service';
import { ConflictsService } from '../src/modules/reservations/conflicts.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { SyncService } from '../src/modules/sync/sync.service';

if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
  // These tests wipe the database. Refuse to touch anything that is not clearly a test DB.
  throw new Error('Integration tests need DATABASE_URL pointing at a *test* database (see .env.test.example)');
}

export const TODAY = '2026-10-01';

export function makeContext() {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const clock = new FixedClock(TODAY);
  const sync = new SyncService(prisma, audit, clock);
  const conflicts = new ConflictsService(prisma);
  const reservations = new ReservationsService(prisma, audit, conflicts, clock);
  const mappings = new MappingsService(prisma, audit);
  return { prisma, audit, clock, sync, conflicts, reservations, mappings };
}

export type Ctx = ReturnType<typeof makeContext>;

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, reservations, sync_runs, source_mappings, ical_feeds, units, properties, users CASCADE',
  );
}

/** A property with units, and Booking room ids mapped to them. */
export async function createProperty(
  prisma: PrismaService,
  opts: { name: string; externalPropertyId: string; rooms: Record<string, string> },
) {
  const property = await prisma.property.create({ data: { name: opts.name } });
  const units: Record<string, string> = {};
  for (const [externalUnitId, unitName] of Object.entries(opts.rooms)) {
    const unit = await prisma.unit.create({ data: { propertyId: property.id, name: unitName } });
    units[unitName] = unit.id;
    await prisma.sourceMapping.create({
      data: {
        source: 'BOOKING',
        externalPropertyId: opts.externalPropertyId,
        externalUnitId,
        propertyId: property.id,
        unitId: unit.id,
      },
    });
  }
  return { property, units };
}

export function booking(over: Partial<NormalizedReservation> = {}): NormalizedReservation {
  return {
    source: 'BOOKING',
    externalId: '123',
    externalPropertyId: 'HOTEL-1',
    externalUnitId: 'ROOM-1',
    guestName: 'João Silva',
    guestEmail: 'joao@example.com',
    guestPhone: '+351 900 000 001',
    checkIn: '2026-10-02',
    checkOut: '2026-10-05',
    numberOfGuests: 2,
    status: 'CONFIRMED',
    ...over,
  };
}

/** An adapter whose data the test controls. */
export class FakeAdapter implements ReservationSourceAdapter {
  readonly source = 'BOOKING' as const;
  readonly mode = 'test';
  constructor(
    public reservations: NormalizedReservation[] = [],
    public snapshots: SnapshotScope[] = [],
    public failWith: Error | null = null,
  ) {}

  async describe() {
    return { configured: true, summary: 'test', details: {} };
  }

  async fetchReservations(): Promise<FetchResult> {
    if (this.failWith) throw this.failWith;
    return { reservations: this.reservations, snapshots: this.snapshots, errors: [] };
  }
}
