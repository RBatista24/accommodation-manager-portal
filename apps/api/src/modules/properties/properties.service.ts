import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Property, Unit } from '@prisma/client';
import { fromIsoDate } from '../../domain/dates';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { presentUnit } from '../units/units.service';

export interface PropertyInput {
  name: string;
  description?: string | null;
  address?: string | null;
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(includeInactive: boolean) {
    const properties = await this.prisma.property.findMany({
      where: includeInactive ? {} : { active: true },
      include: { units: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return properties.map((p) => ({
      ...presentProperty(p),
      unitCount: p.units.filter((u) => u.active).length,
      units: p.units.map(presentUnit),
    }));
  }

  async get(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { units: { orderBy: { name: 'asc' } } },
    });
    if (!property) throw new NotFoundException('Property not found');

    const today = fromIsoDate(this.clock.today());
    const confirmed = { propertyId: id, status: 'CONFIRMED' as const };
    const [upcoming, inHouse, pendingAssignment, total, cancelled] = await Promise.all([
      this.prisma.reservation.count({ where: { ...confirmed, checkIn: { gt: today } } }),
      this.prisma.reservation.count({ where: { ...confirmed, checkIn: { lte: today }, checkOut: { gt: today } } }),
      this.prisma.reservation.count({ where: { ...confirmed, unitId: null, checkOut: { gt: today } } }),
      this.prisma.reservation.count({ where: { propertyId: id } }),
      this.prisma.reservation.count({ where: { propertyId: id, status: 'CANCELLED' } }),
    ]);

    return {
      ...presentProperty(property),
      units: property.units.map(presentUnit),
      reservationSummary: { total, upcoming, inHouse, pendingAssignment, cancelled },
    };
  }

  async create(input: PropertyInput, userId: string) {
    const property = await this.prisma.property.create({
      data: { name: input.name.trim(), description: clean(input.description), address: clean(input.address) },
    });
    await this.audit.record({
      action: AuditAction.PropertyCreated,
      entityType: 'Property',
      entityId: property.id,
      userId,
      metadata: { name: property.name },
    });
    return presentProperty(property);
  }

  async update(id: string, input: Partial<PropertyInput>, userId: string) {
    const before = await this.findOrThrow(id);
    const property = await this.prisma.property.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: clean(input.description) } : {}),
        ...(input.address !== undefined ? { address: clean(input.address) } : {}),
      },
    });
    await this.audit.record({
      action: AuditAction.PropertyUpdated,
      entityType: 'Property',
      entityId: id,
      userId,
      metadata: { before: pick(before), after: pick(property) },
    });
    return presentProperty(property);
  }

  /** Deactivation never deletes anything: units and reservations stay as history. */
  async setActive(id: string, active: boolean, userId: string) {
    await this.findOrThrow(id);
    const property = await this.prisma.property.update({ where: { id }, data: { active } });
    await this.audit.record({
      action: active ? AuditAction.PropertyActivated : AuditAction.PropertyDeactivated,
      entityType: 'Property',
      entityId: id,
      userId,
    });
    return presentProperty(property);
  }

  /**
   * Permanent deletion: the property, its units, reservations, room mappings
   * and their iCal feeds. Only allowed once the property is deactivated, so a
   * live property can never be removed by one click. Audit rows are kept, as
   * the record that the property existed.
   */
  async remove(id: string, userId: string) {
    const property = await this.findOrThrow(id);
    if (property.active) {
      throw new BadRequestException('Deactivate the property before deleting it permanently');
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const mappings = await tx.sourceMapping.findMany({ where: { propertyId: id } });
      let feeds = 0;
      for (const m of mappings) {
        const r = await tx.icalFeed.deleteMany({
          where: { source: m.source, externalPropertyId: m.externalPropertyId, externalUnitId: m.externalUnitId },
        });
        feeds += r.count;
      }
      const reservations = await tx.reservation.deleteMany({ where: { propertyId: id } });
      const mappingCount = await tx.sourceMapping.deleteMany({ where: { propertyId: id } });
      const units = await tx.unit.deleteMany({ where: { propertyId: id } });
      await tx.property.delete({ where: { id } });

      const counts = {
        reservations: reservations.count,
        units: units.count,
        mappings: mappingCount.count,
        feeds,
      };
      await this.audit.record(
        {
          action: AuditAction.PropertyDeleted,
          entityType: 'Property',
          entityId: id,
          userId,
          metadata: { name: property.name, deleted: counts },
        },
        tx,
      );
      return counts;
    });
    return { id, name: property.name, deleted };
  }

  private async findOrThrow(id: string): Promise<Property> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function pick(p: Property) {
  return { name: p.name, description: p.description, address: p.address };
}

export function presentProperty(p: Property & { units?: Unit[] }) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    address: p.address,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
