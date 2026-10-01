import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type DbClient } from '../../infrastructure/prisma/prisma.service';

/**
 * Well-known audit actions. Kept as strings in the database so new ones can be
 * added without a migration. Source-specific actions are built as
 * `${source}_SYNC_STARTED` etc. (BOOKING_SYNC_STARTED today).
 */
export const AuditAction = {
  PropertyCreated: 'PROPERTY_CREATED',
  PropertyUpdated: 'PROPERTY_UPDATED',
  PropertyDeactivated: 'PROPERTY_DEACTIVATED',
  PropertyActivated: 'PROPERTY_ACTIVATED',
  PropertyDeleted: 'PROPERTY_DELETED',
  UnitCreated: 'UNIT_CREATED',
  UnitUpdated: 'UNIT_UPDATED',
  UnitDeactivated: 'UNIT_DEACTIVATED',
  UnitActivated: 'UNIT_ACTIVATED',
  ReservationCreated: 'RESERVATION_CREATED',
  ReservationUpdated: 'RESERVATION_UPDATED',
  ReservationCancelled: 'RESERVATION_CANCELLED',
  ReservationUnitAssigned: 'RESERVATION_UNIT_ASSIGNED',
  ReservationEdited: 'RESERVATION_EDITED',
  ReservationKindChanged: 'RESERVATION_KIND_CHANGED',
  CalendarExportEnabled: 'CALENDAR_EXPORT_ENABLED',
  CalendarExportRotated: 'CALENDAR_EXPORT_ROTATED',
  CalendarExportDisabled: 'CALENDAR_EXPORT_DISABLED',
  IcalFeedCreated: 'ICAL_FEED_CREATED',
  IcalFeedUpdated: 'ICAL_FEED_UPDATED',
  IcalFeedDeleted: 'ICAL_FEED_DELETED',
  syncStarted: (source: string) => `${source}_SYNC_STARTED`,
  syncCompleted: (source: string) => `${source}_SYNC_COMPLETED`,
  syncFailed: (source: string) => `${source}_SYNC_FAILED`,
  mappingCreated: (source: string) => `${source}_MAPPING_CREATED`,
  mappingUpdated: (source: string) => `${source}_MAPPING_UPDATED`,
} as const;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Null for operations performed by the system itself (e.g. synchronization). */
  userId?: string | null;
  /** Context only. Do not put secrets or full guest records here. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  /** Pass a transaction client to make the audit entry part of the same transaction. */
  async record(entry: AuditEntry, db: DbClient = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        userId: entry.userId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    this.logger.log(`${entry.action} ${entry.entityType}${entry.entityId ? `:${entry.entityId}` : ''}`);
  }

  async listFor(entityType: string, entityId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    });
  }
}
