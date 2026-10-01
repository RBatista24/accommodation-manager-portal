import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SourceMapping } from '@prisma/client';
import { resolveAssignment } from '../../domain/mapping-resolution';
import type { ReservationSource } from '../../domain/reservation';
import { PrismaService, type DbClient } from '../../infrastructure/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';

export interface CreateMappingInput {
  source: ReservationSource;
  externalPropertyId: string;
  externalUnitId: string;
  externalName?: string | null;
  propertyId: string;
  unitId?: string | null;
}

export interface UpdateMappingInput {
  propertyId?: string;
  unitId?: string | null;
  externalName?: string | null;
  active?: boolean;
}

const include = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, active: true } },
} satisfies Prisma.SourceMappingInclude;

@Injectable()
export class MappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(source?: ReservationSource) {
    const mappings = await this.prisma.sourceMapping.findMany({
      where: source ? { source } : {},
      include,
      orderBy: [{ source: 'asc' }, { externalPropertyId: 'asc' }, { externalUnitId: 'asc' }],
    });
    const counts = await this.prisma.reservation.groupBy({
      by: ['source', 'externalPropertyRef', 'externalUnitRef'],
      where: source ? { source } : {},
      _count: { _all: true },
    });
    const countFor = (m: SourceMapping) =>
      counts.find(
        (c) =>
          c.source === m.source && c.externalPropertyRef === m.externalPropertyId && c.externalUnitRef === m.externalUnitId,
      )?._count._all ?? 0;

    return mappings.map((m) => ({ ...presentMapping(m), reservationCount: countFor(m) }));
  }

  async create(input: CreateMappingInput, userId: string | null, db: DbClient = this.prisma) {
    await this.assertTarget(input.propertyId, input.unitId ?? null, db);
    const mapping = await db.sourceMapping.create({
      data: {
        source: input.source,
        externalPropertyId: input.externalPropertyId.trim(),
        externalUnitId: input.externalUnitId.trim(),
        externalName: input.externalName?.trim() || null,
        propertyId: input.propertyId,
        unitId: input.unitId ?? null,
      },
      include,
    });
    await this.audit.record(
      {
        action: AuditAction.mappingCreated(mapping.source),
        entityType: 'SourceMapping',
        entityId: mapping.id,
        userId,
        metadata: {
          externalPropertyId: mapping.externalPropertyId,
          externalUnitId: mapping.externalUnitId,
          propertyId: mapping.propertyId,
          unitId: mapping.unitId,
        },
      },
      db,
    );
    const reassigned = await this.reresolveReservations(mapping, userId, db);
    return { ...presentMapping(mapping), reassignedReservations: reassigned };
  }

  async update(id: string, input: UpdateMappingInput, userId: string | null, db: DbClient = this.prisma) {
    const current = await db.sourceMapping.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Mapping not found');

    const propertyId = input.propertyId ?? current.propertyId;
    // Moving the mapping to another property drops a unit that belonged to the old one.
    const propertyChanged = input.propertyId !== undefined && input.propertyId !== current.propertyId;
    const unitId = input.unitId !== undefined ? input.unitId : propertyChanged ? null : current.unitId;
    if (input.propertyId !== undefined || input.unitId !== undefined) {
      await this.assertTarget(propertyId, unitId, db, current.unitId);
    }

    const mapping = await db.sourceMapping.update({
      where: { id },
      data: {
        propertyId,
        unitId,
        ...(input.externalName !== undefined ? { externalName: input.externalName?.trim() || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include,
    });
    await this.audit.record(
      {
        action: AuditAction.mappingUpdated(mapping.source),
        entityType: 'SourceMapping',
        entityId: mapping.id,
        userId,
        metadata: {
          before: { propertyId: current.propertyId, unitId: current.unitId, active: current.active },
          after: { propertyId: mapping.propertyId, unitId: mapping.unitId, active: mapping.active },
        },
      },
      db,
    );
    const reassigned = await this.reresolveReservations(mapping, userId, db);
    return { ...presentMapping(mapping), reassignedReservations: reassigned };
  }

  /**
   * After a mapping changes, reservations from that external room are resolved
   * again, so fixing a mapping fixes the reservations waiting on it. Units that
   * a person assigned by hand are left alone.
   */
  private async reresolveReservations(mapping: SourceMapping, userId: string | null, db: DbClient): Promise<number> {
    const [affected, mappings] = await Promise.all([
      db.reservation.findMany({
        where: {
          source: mapping.source,
          externalPropertyRef: mapping.externalPropertyId,
          externalUnitRef: mapping.externalUnitId,
          unitAssignedManually: false,
        },
        select: { id: true, propertyId: true, unitId: true },
      }),
      db.sourceMapping.findMany({ where: { source: mapping.source } }),
    ]);

    let changed = 0;
    for (const r of affected) {
      const a = resolveAssignment(
        {
          source: mapping.source,
          externalPropertyId: mapping.externalPropertyId,
          externalUnitId: mapping.externalUnitId,
        },
        mappings,
      );
      if (!a.propertyId) continue;
      if (a.propertyId === r.propertyId && a.unitId === r.unitId) continue;
      await db.reservation.update({ where: { id: r.id }, data: { propertyId: a.propertyId, unitId: a.unitId } });
      await this.audit.record(
        {
          action: AuditAction.ReservationUpdated,
          entityType: 'Reservation',
          entityId: r.id,
          userId,
          metadata: {
            reason: 'Mapping changed',
            mappingId: mapping.id,
            before: { propertyId: r.propertyId, unitId: r.unitId },
            after: { propertyId: a.propertyId, unitId: a.unitId },
          },
        },
        db,
      );
      changed++;
    }
    return changed;
  }

  /** The unit must belong to the property; a new link must point at an active unit. */
  private async assertTarget(propertyId: string, unitId: string | null, db: DbClient, previousUnitId?: string | null) {
    const property = await db.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new BadRequestException('Property not found');
    if (!unitId) return;
    const unit = await db.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.propertyId !== propertyId) {
      throw new BadRequestException('The unit does not belong to the selected property');
    }
    if (!unit.active && unit.id !== previousUnitId) {
      throw new BadRequestException('This unit is deactivated and cannot receive new reservations');
    }
  }
}

export function presentMapping(
  m: SourceMapping & { property?: { id: string; name: string }; unit?: { id: string; name: string; active: boolean } | null },
) {
  return {
    id: m.id,
    source: m.source,
    externalPropertyId: m.externalPropertyId,
    externalUnitId: m.externalUnitId,
    externalName: m.externalName,
    propertyId: m.propertyId,
    propertyName: m.property?.name ?? null,
    unitId: m.unitId,
    unitName: m.unit?.name ?? null,
    active: m.active,
    needsUnit: m.active && m.unitId === null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}
