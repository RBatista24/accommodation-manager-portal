import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { addDays, fromIsoDate } from '../../domain/dates';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ENABLED_SOURCES } from '../integrations/integrations.service';
import { ConflictsService } from '../reservations/conflicts.service';
import { presentReservation } from '../reservations/reservation.presenter';
import { presentSyncRun } from '../sync/sync-run.presenter';

const UPCOMING_DAYS = 14;

/**
 * The operational overview. Only shows what Phase 1 implements: no access
 * codes, no guest messaging.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflicts: ConflictsService,
    private readonly clock: Clock,
  ) {}

  async get(propertyId?: string) {
    const today = this.clock.today();
    const todayDate = fromIsoDate(today);
    const scope: Prisma.ReservationWhereInput = {
      status: 'CONFIRMED',
      property: { active: true },
      ...(propertyId ? { propertyId } : {}),
    };
    const include = {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
    } satisfies Prisma.ReservationInclude;

    const [checkIns, checkOuts, inHouse, upcoming, unassigned, units, conflicts, lastRuns] = await Promise.all([
      this.prisma.reservation.findMany({ where: { ...scope, checkIn: todayDate }, include, orderBy: { guestName: 'asc' } }),
      this.prisma.reservation.findMany({ where: { ...scope, checkOut: todayDate }, include, orderBy: { guestName: 'asc' } }),
      this.prisma.reservation.findMany({
        where: { ...scope, checkIn: { lte: todayDate }, checkOut: { gt: todayDate } },
        include,
        orderBy: { checkOut: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { ...scope, checkIn: { gt: todayDate, lte: fromIsoDate(addDays(today, UPCOMING_DAYS)) } },
        include,
        orderBy: { checkIn: 'asc' },
        take: 20,
      }),
      this.prisma.reservation.findMany({
        where: { ...scope, unitId: null, checkOut: { gt: todayDate } },
        include,
        orderBy: { checkIn: 'asc' },
      }),
      this.prisma.unit.findMany({
        where: { active: true, property: { active: true }, ...(propertyId ? { propertyId } : {}) },
        include: { property: { select: { id: true, name: true } } },
        orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
      }),
      this.conflicts.find({ from: today, propertyId }),
      Promise.all(
        ENABLED_SOURCES.map((source) =>
          this.prisma.syncRun.findFirst({ where: { source }, orderBy: { startedAt: 'desc' } }),
        ),
      ),
    ]);

    const occupiedUnitIds = new Set(inHouse.map((r) => r.unitId).filter(Boolean));
    const syncs = ENABLED_SOURCES.map((source, i) => ({
      source,
      lastSync: lastRuns[i] ? presentSyncRun(lastRuns[i]!) : null,
    }));

    const attention: { kind: string; severity: 'warning' | 'error'; message: string; count: number }[] = [];
    if (unassigned.length > 0) {
      attention.push({
        kind: 'PENDING_ASSIGNMENT',
        severity: 'warning',
        count: unassigned.length,
        message: `${unassigned.length} reservation${unassigned.length === 1 ? '' : 's'} pending unit assignment`,
      });
    }
    if (conflicts.length > 0) {
      attention.push({
        kind: 'CONFLICT',
        severity: 'error',
        count: conflicts.length,
        message: `${conflicts.length} reservation conflict${conflicts.length === 1 ? '' : 's'} detected`,
      });
    }
    for (const s of syncs) {
      if (s.lastSync?.status === 'FAILED') {
        attention.push({ kind: 'SYNC_FAILED', severity: 'error', count: 1, message: `${label(s.source)} synchronization failed` });
      } else if (s.lastSync?.status === 'PARTIAL') {
        attention.push({
          kind: 'SYNC_PARTIAL',
          severity: 'warning',
          count: s.lastSync.counts.errors,
          message: `${label(s.source)} synchronization finished with problems`,
        });
      }
    }

    const present = (r: (typeof checkIns)[number]) => presentReservation(r);
    return {
      date: today,
      today: {
        checkIns: checkIns.map(present),
        checkOuts: checkOuts.map(present),
        inHouse: inHouse.map(present),
      },
      occupancy: {
        totalUnits: units.length,
        occupiedUnits: units.filter((u) => occupiedUnitIds.has(u.id)).length,
        availableUnits: units.filter((u) => !occupiedUnitIds.has(u.id)).length,
        units: units.map((u) => ({
          id: u.id,
          name: u.name,
          propertyId: u.propertyId,
          propertyName: u.property.name,
          occupied: occupiedUnitIds.has(u.id),
          currentReservationId: inHouse.find((r) => r.unitId === u.id)?.id ?? null,
        })),
      },
      upcoming: upcoming.map(present),
      pendingAssignment: unassigned.map(present),
      conflicts,
      syncs,
      attention,
    };
  }
}

function label(source: string): string {
  return source === 'BOOKING' ? 'Booking' : source.charAt(0) + source.slice(1).toLowerCase();
}
