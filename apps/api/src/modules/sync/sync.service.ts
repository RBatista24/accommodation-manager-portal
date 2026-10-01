import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Reservation, type SyncRun } from '@prisma/client';
import { fromIsoDate, toIsoDate } from '../../domain/dates';
import { resolveAssignment, type MappingLike } from '../../domain/mapping-resolution';
import type { NormalizedReservation, ReservationSource, StoredReservation } from '../../domain/reservation';
import { planReservationChange, type SyncedFields } from '../../domain/reservation-change';
import { reservationsMissingFromSnapshot } from '../../domain/snapshot-cancellation';
import { validateNormalizedReservation } from '../../domain/validation';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  SourceUnavailableError,
  type FetchResult,
  type ReservationSourceAdapter,
} from '../../integrations/reservation-source-adapter';
import { AuditAction, AuditService } from '../audit/audit.service';

/** A RUNNING sync older than this is assumed to have died (e.g. the server restarted). */
const STALE_RUN_MS = 15 * 60 * 1000;
const MAX_STORED_ERRORS = 100;

interface SyncItemError {
  externalId?: string;
  scope?: string;
  message: string;
}

interface Counters {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  pending: number;
}

type ItemOutcome = {
  /** 'cancelled' = the change was (at least) a cancellation; counted once, as a cancellation. */
  kind: 'created' | 'updated' | 'unchanged' | 'cancelled';
  pending: boolean;
};

/**
 * Runs one synchronization for one source. Source-agnostic: everything it
 * knows about the provider comes through the adapter as NormalizedReservation.
 *
 * Idempotent by construction: each reservation is looked up by
 * (source, externalId), which PostgreSQL also enforces with a unique index.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly inProgress = new Set<ReservationSource>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async run(adapter: ReservationSourceAdapter): Promise<SyncRun> {
    const source = adapter.source;
    if (this.inProgress.has(source)) {
      throw new ConflictException('A synchronization is already running. Please wait for it to finish.');
    }
    this.inProgress.add(source);
    try {
      await this.failStaleRuns(source);
      const running = await this.prisma.syncRun.findFirst({ where: { source, status: 'RUNNING' } });
      if (running) {
        throw new ConflictException('A synchronization is already running. Please wait for it to finish.');
      }

      const run = await this.prisma.syncRun.create({ data: { source, startedAt: this.clock.now() } });
      await this.audit.record({
        action: AuditAction.syncStarted(source),
        entityType: 'SyncRun',
        entityId: run.id,
        metadata: { mode: adapter.mode },
      });
      this.logger.log(`Sync ${run.id} started (${source}, ${adapter.mode})`);
      return await this.execute(run.id, adapter);
    } finally {
      this.inProgress.delete(source);
    }
  }

  private async execute(runId: string, adapter: ReservationSourceAdapter): Promise<SyncRun> {
    const source = adapter.source;
    const today = this.clock.today();

    let fetched: FetchResult;
    try {
      fetched = await adapter.fetchReservations({ today });
    } catch (err) {
      const userMessage =
        err instanceof SourceUnavailableError ? err.userMessage : 'The reservations could not be retrieved.';
      this.logger.error(`Sync ${runId} could not fetch from ${source}: ${errorText(err)}`, errorStack(err));
      return this.finish(runId, source, emptyCounters(), [{ message: userMessage }], { fetchFailed: true });
    }

    const counters = emptyCounters();
    counters.fetched = fetched.reservations.length;
    const errors: SyncItemError[] = fetched.errors.map((e) => ({ scope: e.scope, message: e.message }));

    // The same external id twice in one fetch: the last occurrence wins.
    const unique = new Map<string, NormalizedReservation>();
    for (const r of fetched.reservations) unique.set(r.externalId, r);

    const mappings = await this.recordUnknownRooms(source, [...unique.values()]);

    for (const item of unique.values()) {
      const problems = validateNormalizedReservation(item);
      if (problems.length > 0) {
        errors.push({ externalId: item.externalId, message: problems.join('; ') });
        continue;
      }
      const assignment = resolveAssignment(item, mappings);
      if (!assignment.propertyId) {
        errors.push({
          externalId: item.externalId,
          message: `No local property is mapped to external property "${item.externalPropertyId}"`,
        });
        continue;
      }
      try {
        const outcome = await this.applyWithRetry(runId, item, {
          propertyId: assignment.propertyId,
          unitId: assignment.unitId,
        });
        counters[outcome.kind]++;
        if (outcome.pending) counters.pending++;
      } catch (err) {
        this.logger.error(`Sync ${runId}: failed to save ${item.externalId}: ${errorText(err)}`, errorStack(err));
        errors.push({ externalId: item.externalId, message: 'This reservation could not be saved' });
      }
    }

    for (const scope of fetched.snapshots) {
      try {
        const cancelled = await this.cancelMissingFromSnapshot(runId, scope, errors);
        counters.cancelled += cancelled;
      } catch (err) {
        this.logger.error(`Sync ${runId}: cancellation check failed: ${errorText(err)}`, errorStack(err));
        errors.push({ scope: scope.externalUnitId, message: 'Could not check this calendar for cancellations' });
      }
    }

    return this.finish(runId, source, counters, errors, { fetchFailed: false });
  }

  /**
   * "Record unresolved unit mappings": an external room we have never seen, of
   * an external property we DO know, gets a mapping row without a unit. It
   * then shows up on the mapping screen as needing a unit.
   */
  private async recordUnknownRooms(
    source: ReservationSource,
    items: NormalizedReservation[],
  ): Promise<MappingLike[]> {
    const mappings = await this.prisma.sourceMapping.findMany({ where: { source } });
    const seen = new Set(mappings.map((m) => `${m.externalPropertyId}\u0000${m.externalUnitId}`));

    for (const item of items) {
      if (!item.externalPropertyId || !item.externalUnitId) continue;
      const key = `${item.externalPropertyId}\u0000${item.externalUnitId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const assignment = resolveAssignment(item, mappings);
      if (assignment.resolvedBy !== 'property-mapping' || !assignment.propertyId) continue;

      const created = await this.prisma.sourceMapping.upsert({
        where: {
          source_externalPropertyId_externalUnitId: {
            source,
            externalPropertyId: item.externalPropertyId,
            externalUnitId: item.externalUnitId,
          },
        },
        update: {},
        create: {
          source,
          externalPropertyId: item.externalPropertyId,
          externalUnitId: item.externalUnitId,
          externalName: item.externalUnitName ?? null,
          propertyId: assignment.propertyId,
          unitId: null,
        },
      });
      mappings.push(created);
      await this.audit.record({
        action: AuditAction.mappingCreated(source),
        entityType: 'SourceMapping',
        entityId: created.id,
        metadata: { automatic: true, externalUnitId: item.externalUnitId, reason: 'Unknown external room' },
      });
    }
    return mappings;
  }

  private async applyWithRetry(
    runId: string,
    item: NormalizedReservation,
    assignment: { propertyId: string; unitId: string | null },
  ): Promise<ItemOutcome> {
    try {
      return await this.applyOne(runId, item, assignment);
    } catch (err) {
      // Two syncs racing on the same new reservation: the unique index stops
      // the duplicate, and the retry turns it into an update.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.applyOne(runId, item, assignment);
      }
      throw err;
    }
  }

  private async applyOne(
    runId: string,
    item: NormalizedReservation,
    assignment: { propertyId: string; unitId: string | null },
  ): Promise<ItemOutcome> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.reservation.findFirst({
        where: { source: item.source, externalId: item.externalId },
      });
      const plan = planReservationChange(existing ? toStored(existing) : null, item, assignment);

      if (plan.kind === 'create') {
        const created = await tx.reservation.create({
          data: {
            ...toDbCreate(plan.data),
            source: item.source,
            externalId: item.externalId,
            lastSyncedAt: now,
            lastSyncRunId: runId,
          },
        });
        await this.audit.record(
          {
            action: AuditAction.ReservationCreated,
            entityType: 'Reservation',
            entityId: created.id,
            metadata: {
              syncRunId: runId,
              source: item.source,
              externalId: item.externalId,
              status: created.status,
              checkIn: plan.data.checkIn,
              checkOut: plan.data.checkOut,
              unitId: created.unitId,
            },
          },
          tx,
        );
        return {
          kind: 'created',
          pending: created.status === 'CONFIRMED' && created.unitId === null,
        };
      }

      const current = existing!;
      if (plan.kind === 'unchanged') {
        await tx.reservation.update({
          where: { id: current.id },
          data: { lastSyncedAt: now, lastSyncRunId: runId },
        });
        return {
          kind: 'unchanged',
          pending: current.status === 'CONFIRMED' && current.unitId === null,
        };
      }

      const updated = await tx.reservation.update({
        where: { id: current.id },
        data: { ...toDbUpdate(plan.changes), lastSyncedAt: now, lastSyncRunId: runId },
      });
      await this.audit.record(
        {
          action:
            plan.transition === 'cancelled' ? AuditAction.ReservationCancelled : AuditAction.ReservationUpdated,
          entityType: 'Reservation',
          entityId: updated.id,
          metadata: {
            syncRunId: runId,
            changedFields: plan.changedFields,
            transition: plan.transition,
            before: pickAuditable(toStored(current), plan.changedFields),
            after: pickAuditable(toStored(updated), plan.changedFields),
          },
        },
        tx,
      );
      return {
        kind: plan.transition === 'cancelled' ? 'cancelled' : 'updated',
        pending: updated.status === 'CONFIRMED' && updated.unitId === null,
      };
    });
  }

  private async cancelMissingFromSnapshot(
    runId: string,
    scope: FetchResult['snapshots'][number],
    errors: SyncItemError[],
  ): Promise<number> {
    const stored = await this.prisma.reservation.findMany({
      where: {
        source: scope.source,
        externalPropertyRef: scope.externalPropertyId,
        externalUnitRef: scope.externalUnitId,
        status: 'CONFIRMED',
      },
      select: { id: true, externalId: true, checkOut: true, status: true },
    });
    const result = reservationsMissingFromSnapshot(
      scope,
      stored.map((r) => ({ ...r, checkOut: toIsoDate(r.checkOut) })),
    );
    if (result.skippedReason) {
      errors.push({ scope: scope.externalUnitId, message: result.skippedReason });
      return 0;
    }

    const now = this.clock.now();
    for (const id of result.toCancel) {
      await this.prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id },
          data: { status: 'CANCELLED', lastSyncedAt: now, lastSyncRunId: runId },
        });
        await this.audit.record(
          {
            action: AuditAction.ReservationCancelled,
            entityType: 'Reservation',
            entityId: id,
            metadata: {
              syncRunId: runId,
              transition: 'cancelled',
              inferred: true,
              reason: 'No longer present in the source calendar',
            },
          },
          tx,
        );
      });
    }
    return result.toCancel.length;
  }

  private async finish(
    runId: string,
    source: ReservationSource,
    counters: Counters,
    errors: SyncItemError[],
    opts: { fetchFailed: boolean },
  ): Promise<SyncRun> {
    const processed = counters.created + counters.updated + counters.unchanged + counters.cancelled;
    const status = opts.fetchFailed
      ? 'FAILED'
      : errors.length === 0
        ? 'SUCCESS'
        : processed > 0 || counters.fetched === 0
          ? 'PARTIAL'
          : 'FAILED';

    const errorMessage =
      errors.length === 0
        ? null
        : opts.fetchFailed
          ? errors[0]!.message
          : `${errors.length} problem${errors.length === 1 ? '' : 's'} during synchronization`;

    const run = await this.prisma.syncRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: this.clock.now(),
        fetchedCount: counters.fetched,
        createdCount: counters.created,
        updatedCount: counters.updated,
        unchangedCount: counters.unchanged,
        cancelledCount: counters.cancelled,
        pendingCount: counters.pending,
        errorCount: errors.length,
        errorMessage,
        errorDetails: errors.length > 0 ? (errors.slice(0, MAX_STORED_ERRORS) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    await this.audit.record({
      action: status === 'FAILED' ? AuditAction.syncFailed(source) : AuditAction.syncCompleted(source),
      entityType: 'SyncRun',
      entityId: runId,
      metadata: { status, ...counters, errorCount: errors.length },
    });
    this.logger.log(
      `Sync ${runId} ${status}: fetched=${counters.fetched} created=${counters.created} updated=${counters.updated} ` +
        `unchanged=${counters.unchanged} cancelled=${counters.cancelled} pending=${counters.pending} errors=${errors.length}`,
    );
    return run;
  }

  private async failStaleRuns(source: ReservationSource): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - STALE_RUN_MS);
    const stale = await this.prisma.syncRun.updateMany({
      where: { source, status: 'RUNNING', startedAt: { lt: cutoff } },
      data: {
        status: 'FAILED',
        finishedAt: this.clock.now(),
        errorMessage: 'The synchronization was interrupted before it finished.',
        errorCount: 1,
      },
    });
    if (stale.count > 0) this.logger.warn(`Marked ${stale.count} interrupted ${source} sync(s) as failed`);
  }
}

function emptyCounters(): Counters {
  return { fetched: 0, created: 0, updated: 0, unchanged: 0, cancelled: 0, pending: 0 };
}

export function toStored(r: Reservation): StoredReservation {
  return {
    id: r.id,
    propertyId: r.propertyId,
    unitId: r.unitId,
    unitAssignedManually: r.unitAssignedManually,
    manualFields: r.manualFields,
    externalPropertyRef: r.externalPropertyRef,
    externalUnitRef: r.externalUnitRef,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestPhone: r.guestPhone,
    checkIn: toIsoDate(r.checkIn),
    checkOut: toIsoDate(r.checkOut),
    numberOfGuests: r.numberOfGuests,
    status: r.status,
  };
}

function toDbCreate(data: SyncedFields) {
  const { checkIn, checkOut, ...rest } = data;
  return { ...rest, checkIn: fromIsoDate(checkIn), checkOut: fromIsoDate(checkOut) };
}

function toDbUpdate(changes: Partial<SyncedFields>): Prisma.ReservationUncheckedUpdateInput {
  const { checkIn, checkOut, ...rest } = changes;
  return {
    ...rest,
    ...(checkIn !== undefined ? { checkIn: fromIsoDate(checkIn) } : {}),
    ...(checkOut !== undefined ? { checkOut: fromIsoDate(checkOut) } : {}),
  };
}

/** Audit keeps dates, status and assignment changes; guest contact details are only named, not copied. */
function pickAuditable(r: StoredReservation, fields: (keyof SyncedFields)[]): Record<string, unknown> {
  const safe: (keyof SyncedFields)[] = ['checkIn', 'checkOut', 'status', 'unitId', 'propertyId', 'numberOfGuests'];
  const out: Record<string, unknown> = {};
  for (const f of fields) if (safe.includes(f)) out[f] = r[f];
  return out;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}
