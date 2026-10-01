import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { detectConflicts } from '../../domain/conflicts';
import { fromIsoDate, toIsoDate, type IsoDate } from '../../domain/dates';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface ConflictQuery {
  /** Only stays overlapping [from, to) are considered. Open-ended when omitted. */
  from?: IsoDate;
  to?: IsoDate;
  propertyId?: string;
  unitIds?: string[];
}

/** Conflict detection happens here, in the backend, using the domain rule. */
@Injectable()
export class ConflictsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(query: ConflictQuery) {
    const where: Prisma.ReservationWhereInput = {
      status: 'CONFIRMED',
      unitId: query.unitIds ? { in: query.unitIds } : { not: null },
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.to ? { checkIn: { lt: fromIsoDate(query.to) } } : {}),
      ...(query.from ? { checkOut: { gt: fromIsoDate(query.from) } } : {}),
    };
    const rows = await this.prisma.reservation.findMany({
      where,
      include: { unit: { select: { id: true, name: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const conflicts = detectConflicts(
      rows.map((r) => ({
        id: r.id,
        unitId: r.unitId,
        checkIn: toIsoDate(r.checkIn),
        checkOut: toIsoDate(r.checkOut),
        status: r.status,
      })),
    );

    return conflicts.map((c) => {
      const [a, b] = c.reservationIds.map((id) => byId.get(id)!);
      const brief = (r: typeof a) => ({
        id: r!.id,
        guestName: r!.guestName,
        checkIn: toIsoDate(r!.checkIn),
        checkOut: toIsoDate(r!.checkOut),
        source: r!.source,
        kind: r!.kind,
        externalId: r!.externalId,
      });
      return {
        unitId: c.unitId,
        unitName: a?.unit?.name ?? null,
        propertyId: a!.propertyId,
        overlapFrom: c.overlapFrom,
        overlapTo: c.overlapTo,
        reservations: [brief(a), brief(b)],
      };
    });
  }
}
