import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { buildUnitCalendar, selectExportable } from '../../domain/calendar-export';
import { toIsoDate } from '../../domain/dates';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';

/**
 * Outgoing iCal links, one per unit, for Booking.com ("Import calendar") so
 * that direct reservations and blocked dates close the room there too.
 *
 * The link is a capability URL: whoever has it can read which nights are
 * taken (never who). So the token is long and random, can be rotated, and is
 * never written to logs or the audit log.
 */
@Injectable()
export class CalendarExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Every active unit with the state of its export link (for the settings screen). */
  async list() {
    const units = await this.prisma.unit.findMany({
      where: { active: true, property: { active: true } },
      include: { property: { select: { name: true } } },
      orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
    });
    return units.map((u) => ({
      unitId: u.id,
      unitName: u.name,
      propertyId: u.propertyId,
      propertyName: u.property.name,
      enabled: !!u.exportToken,
      url: u.exportToken ? this.urlFor(u.exportToken) : null,
      createdAt: u.exportTokenCreatedAt?.toISOString() ?? null,
    }));
  }

  /** Creates the link, or replaces it with a new one (the old link stops working). */
  async enable(unitId: string, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id: unitId }, data: { exportToken: token, exportTokenCreatedAt: now } });
      await this.audit.record(
        {
          action: unit.exportToken ? AuditAction.CalendarExportRotated : AuditAction.CalendarExportEnabled,
          entityType: 'Unit',
          entityId: unitId,
          userId,
          metadata: { unitName: unit.name },
        },
        tx,
      );
    });
    return { unitId, enabled: true, url: this.urlFor(token), createdAt: now.toISOString() };
  }

  async disable(unitId: string, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (!unit.exportToken) return { unitId, enabled: false, url: null, createdAt: null };
    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id: unitId }, data: { exportToken: null, exportTokenCreatedAt: null } });
      await this.audit.record(
        { action: AuditAction.CalendarExportDisabled, entityType: 'Unit', entityId: unitId, userId, metadata: { unitName: unit.name } },
        tx,
      );
    });
    return { unitId, enabled: false, url: null, createdAt: null };
  }

  /** The .ics text for a token; 404 for unknown or disabled tokens (never says which). */
  async render(token: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new NotFoundException();
    const unit = await this.prisma.unit.findUnique({
      where: { exportToken: token },
      include: { property: { select: { name: true } } },
    });
    if (!unit) throw new NotFoundException();
    const rows = await this.prisma.reservation.findMany({
      where: { unitId: unit.id, status: 'CONFIRMED', source: { not: 'BOOKING' } },
      select: { id: true, source: true, status: true, kind: true, checkIn: true, checkOut: true },
    });
    const stays = selectExportable(
      rows.map((r) => ({ ...r, checkIn: toIsoDate(r.checkIn), checkOut: toIsoDate(r.checkOut) })),
      this.clock.today(),
    );
    return buildUnitCalendar({ calendarName: `${unit.property.name} · ${unit.name}`, stays, now: this.clock.now() });
  }

  private urlFor(token: string): string {
    return `${this.config.publicBaseUrl}/api/calendar-export/${token}.ics`;
  }
}
