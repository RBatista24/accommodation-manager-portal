import { BadRequestException, Injectable } from '@nestjs/common';
import { fromIsoDate, isIsoDate, nightsBetween, type IsoDate } from '../../domain/dates';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConflictsService } from '../reservations/conflicts.service';
import { presentReservation } from '../reservations/reservation.presenter';

const MAX_RANGE_DAYS = 93;

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflicts: ConflictsService,
  ) {}

  /**
   * Everything needed to draw the calendar for [from, to): the units (rows),
   * every reservation touching the range (including cancelled and unassigned
   * ones, flagged), and the conflicts in the range.
   */
  async get(range: { from: IsoDate; to: IsoDate; propertyId?: string }) {
    const { from, to, propertyId } = range;
    if (!isIsoDate(from) || !isIsoDate(to)) throw new BadRequestException('Dates must be YYYY-MM-DD');
    if (to <= from) throw new BadRequestException('"to" must be after "from"');
    if (nightsBetween(from, to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(`The calendar range is limited to ${MAX_RANGE_DAYS} days`);
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        ...(propertyId ? { propertyId } : {}),
        checkIn: { lt: fromIsoDate(to) },
        checkOut: { gt: fromIsoDate(from) },
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, active: true } },
      },
      orderBy: [{ checkIn: 'asc' }],
    });

    // Rows: active units, plus deactivated units that still have reservations here.
    const unitIdsInRange = [...new Set(reservations.map((r) => r.unitId).filter((x): x is string => !!x))];
    const units = await this.prisma.unit.findMany({
      where: {
        ...(propertyId ? { propertyId } : {}),
        property: { active: true },
        OR: [{ active: true }, { id: { in: unitIdsInRange } }],
      },
      include: { property: { select: { id: true, name: true } } },
      orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
    });

    const conflicts = await this.conflicts.find({ from, to, propertyId });
    const conflictIds = new Set(conflicts.flatMap((c) => c.reservations.map((r) => r.id)));

    return {
      from,
      to,
      units: units.map((u) => ({
        id: u.id,
        name: u.name,
        active: u.active,
        propertyId: u.propertyId,
        propertyName: u.property.name,
      })),
      reservations: reservations.map((r) => presentReservation(r, conflictIds)),
      conflicts,
    };
  }
}
