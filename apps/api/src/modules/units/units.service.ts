import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Unit } from '@prisma/client';
import { fromIsoDate } from '../../domain/dates';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';

export interface UnitInput {
  name: string;
  description?: string | null;
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async listForProperty(propertyId: string, includeInactive: boolean) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');
    const units = await this.prisma.unit.findMany({
      where: { propertyId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
    });
    return units.map(presentUnit);
  }

  async create(propertyId: string, input: UnitInput, userId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');
    if (!property.active) throw new BadRequestException('Units cannot be added to a deactivated property');

    const unit = await this.withNameCheck(() =>
      this.prisma.unit.create({
        data: { propertyId, name: input.name.trim(), description: input.description?.trim() || null },
      }),
    );
    await this.audit.record({
      action: AuditAction.UnitCreated,
      entityType: 'Unit',
      entityId: unit.id,
      userId,
      metadata: { propertyId, name: unit.name },
    });
    return presentUnit(unit);
  }

  async update(id: string, input: Partial<UnitInput>, userId: string) {
    const before = await this.findOrThrow(id);
    const unit = await this.withNameCheck(() =>
      this.prisma.unit.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        },
      }),
    );
    await this.audit.record({
      action: AuditAction.UnitUpdated,
      entityType: 'Unit',
      entityId: id,
      userId,
      metadata: {
        before: { name: before.name, description: before.description },
        after: { name: unit.name, description: unit.description },
      },
    });
    return presentUnit(unit);
  }

  /**
   * Deactivating keeps every reservation (past and future) exactly as it is.
   * The response says how many upcoming reservations still point at the unit,
   * so the UI can warn about them.
   */
  async setActive(id: string, active: boolean, userId: string) {
    const current = await this.findOrThrow(id);
    if (active) {
      const property = await this.prisma.property.findUnique({ where: { id: current.propertyId } });
      if (!property?.active) throw new BadRequestException('Activate the property first');
    }
    const unit = await this.prisma.unit.update({ where: { id }, data: { active } });
    const upcomingReservations = await this.prisma.reservation.count({
      where: { unitId: id, status: 'CONFIRMED', checkOut: { gt: fromIsoDate(this.clock.today()) } },
    });
    await this.audit.record({
      action: active ? AuditAction.UnitActivated : AuditAction.UnitDeactivated,
      entityType: 'Unit',
      entityId: id,
      userId,
      metadata: { upcomingReservations },
    });
    return { ...presentUnit(unit), upcomingReservations };
  }

  private async findOrThrow(id: string): Promise<Unit> {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  private async withNameCheck<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This property already has a unit with that name');
      }
      throw err;
    }
  }
}

export function presentUnit(u: Unit) {
  return {
    id: u.id,
    propertyId: u.propertyId,
    name: u.name,
    description: u.description,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
