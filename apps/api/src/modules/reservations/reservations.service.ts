import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { overlapsFor } from '../../domain/conflicts';
import { fromIsoDate, isIsoDate, toIsoDate, type IsoDate } from '../../domain/dates';
import { validateManualStay } from '../../domain/manual-reservation';
import type { ReservationKind, ReservationSource, ReservationStatus } from '../../domain/reservation';
import { Clock } from '../../infrastructure/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ConflictsService } from './conflicts.service';
import { presentReservation } from './reservation.presenter';

export interface ReservationFilters {
  propertyId?: string;
  unitId?: string;
  source?: ReservationSource;
  status?: ReservationStatus;
  kind?: ReservationKind;
  /** Stays overlapping [from, to). */
  from?: IsoDate;
  to?: IsoDate;
  /** Guest name or external reservation id. */
  q?: string;
  /** Only reservations without a unit. */
  unassigned?: boolean;
  /** Only reservations that conflict with another. */
  conflicts?: boolean;
  page?: number;
  pageSize?: number;
}

export interface EditReservationInput {
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  numberOfGuests?: number | null;
  notes?: string | null;
  billingName?: string | null;
  billingNif?: string | null;
  billingAddress?: string | null;
  /** Stay fields: only for reservations created in the app (source DIRECT). */
  checkIn?: IsoDate;
  checkOut?: IsoDate;
  unitId?: string;
  /** Save even if the new stay overlaps another reservation of the unit. */
  acceptConflicts?: boolean;
}

/** A reservation typed in by a person (source DIRECT): a guest stay or blocked dates. */
export interface CreateReservationInput {
  propertyId: string;
  unitId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  /** STAY (default) or BLOCK. A block has no guest; `notes` holds the reason. */
  kind?: ReservationKind;
  /** Required for a guest stay. */
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  numberOfGuests?: number | null;
  notes?: string | null;
  billingName?: string | null;
  billingNif?: string | null;
  billingAddress?: string | null;
  acceptConflicts?: boolean;
}

const DETAIL_KEYS = ['guestName', 'guestEmail', 'guestPhone', 'numberOfGuests', 'notes', 'billingName', 'billingNif', 'billingAddress'] as const;
type DetailKey = (typeof DETAIL_KEYS)[number];
type Details = { [K in DetailKey]?: K extends 'numberOfGuests' ? number | null : string | null };

/**
 * 400 for a list of input problems. The response body keeps the list (the web
 * shows each line); the error's own message joins them so logs and callers
 * see the actual reason instead of "Bad Request Exception".
 */
function invalidInput(problems: string[]): BadRequestException {
  const error = new BadRequestException(problems);
  error.message = problems.join(' ');
  return error;
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim());

/** Trims text, turns empty into null, normalises the NIF/VAT number and validates. */
function normalizeDetails(input: Partial<Record<DetailKey, unknown>>): Details {
  const nif = clean(input.billingNif as string | null | undefined);
  const next: Details = {
    guestName: clean(input.guestName as string | null | undefined),
    guestEmail: clean(input.guestEmail as string | null | undefined),
    guestPhone: clean(input.guestPhone as string | null | undefined),
    notes: clean(input.notes as string | null | undefined),
    billingName: clean(input.billingName as string | null | undefined),
    // NIF or VAT number: separators dropped, letters upper-cased (pt 123 456 789 -> PT123456789).
    billingNif: nif ? nif.replace(/[\s./-]/g, '').toUpperCase() : nif,
    billingAddress: clean(input.billingAddress as string | null | undefined),
    numberOfGuests: input.numberOfGuests as number | null | undefined,
  };
  if (next.numberOfGuests != null && (!Number.isInteger(next.numberOfGuests) || next.numberOfGuests < 1)) {
    throw new BadRequestException('Number of guests must be at least 1');
  }
  if (next.billingNif && !/^[A-Z0-9]{4,20}$/.test(next.billingNif)) {
    throw new BadRequestException('Enter a valid NIF or VAT number (letters and digits only)');
  }
  return next;
}

const include = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, active: true } },
} satisfies Prisma.ReservationInclude;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly conflicts: ConflictsService,
    private readonly clock: Clock,
  ) {}

  async list(filters: ReservationFilters) {
    if (filters.from && !isIsoDate(filters.from)) throw new BadRequestException('Invalid "from" date');
    if (filters.to && !isIsoDate(filters.to)) throw new BadRequestException('Invalid "to" date');
    if (filters.from && filters.to && filters.to <= filters.from) {
      throw new BadRequestException('"to" must be after "from"');
    }

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const q = filters.q?.trim();

    const where: Prisma.ReservationWhereInput = {
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.unassigned ? { unitId: null } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.to ? { checkIn: { lt: fromIsoDate(filters.to) } } : {}),
      ...(filters.from ? { checkOut: { gt: fromIsoDate(filters.from) } } : {}),
      ...(q
        ? {
            OR: [
              { guestName: { contains: q, mode: 'insensitive' } },
              { externalId: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Conflicts are computed over the whole matching range, not just one page.
    const conflicts = await this.conflicts.find({
      from: filters.from,
      to: filters.to,
      propertyId: filters.propertyId,
    });
    const conflictIds = new Set(conflicts.flatMap((c) => c.reservations.map((r) => r.id)));
    if (filters.conflicts) where.id = { in: [...conflictIds] };

    const [total, rows] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include,
        orderBy: [{ checkIn: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => presentReservation(r, conflictIds)),
      page,
      pageSize,
      total,
    };
  }

  async get(id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id }, include });
    if (!r) throw new NotFoundException('Reservation not found');

    const conflicts = r.unitId
      ? (await this.conflicts.find({
          from: toIsoDate(r.checkIn),
          to: toIsoDate(r.checkOut),
          unitIds: [r.unitId],
        })).filter((c) => c.reservations.some((x) => x.id === r.id))
      : [];

    const [history, lastSyncRun, assignableUnits] = await Promise.all([
      this.audit.listFor('Reservation', id, 30),
      r.lastSyncRunId ? this.prisma.syncRun.findUnique({ where: { id: r.lastSyncRunId } }) : null,
      this.prisma.unit.findMany({
        where: { propertyId: r.propertyId, active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return {
      ...presentReservation(r, new Set(conflicts.length > 0 ? [r.id] : [])),
      conflicts,
      assignableUnits,
      lastSync: lastSyncRun
        ? { id: lastSyncRun.id, status: lastSyncRun.status, finishedAt: lastSyncRun.finishedAt?.toISOString() ?? null }
        : null,
      history: history.map((h) => ({
        id: h.id,
        timestamp: h.timestamp.toISOString(),
        action: h.action,
        user: h.user ? { id: h.user.id, name: h.user.name } : null,
        metadata: h.metadata,
      })),
    };
  }

  /**
   * Manual resolution of a reservation's unit. From then on, synchronization
   * will not change the unit of this reservation.
   */
  async assignUnit(id: string, unitId: string, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.propertyId !== reservation.propertyId) {
      throw new BadRequestException('Choose a unit of the same property as the reservation');
    }
    if (!unit.active) throw new BadRequestException('This unit is deactivated');

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data: { unitId, unitAssignedManually: true } });
      await this.audit.record(
        {
          action: AuditAction.ReservationUnitAssigned,
          entityType: 'Reservation',
          entityId: id,
          userId,
          metadata: { before: { unitId: reservation.unitId }, after: { unitId } },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Creates a reservation typed in by a person: source DIRECT, no external id,
   * unit required. Overlaps with other stays of the unit are refused with 409
   * (listing them) unless the caller confirms with `acceptConflicts`.
   */
  async create(input: CreateReservationInput, userId: string) {
    const problems = validateManualStay(input);
    if (problems.length > 0) throw invalidInput(problems);
    const property = await this.prisma.property.findUnique({ where: { id: input.propertyId } });
    if (!property) throw new BadRequestException('Choose an existing property');
    if (!property.active) throw new BadRequestException('This property is deactivated');
    await this.assertUsableUnit(input.unitId, input.propertyId);
    const kind: ReservationKind = input.kind ?? 'STAY';
    // A block has no guest: only the reason (notes) is kept.
    const details = kind === 'BLOCK' ? normalizeDetails({ notes: input.notes }) : normalizeDetails(input);
    const conflicts = await this.checkOverlaps(
      { unitId: input.unitId, checkIn: input.checkIn, checkOut: input.checkOut },
      input.acceptConflicts,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.create({
        data: {
          propertyId: input.propertyId,
          unitId: input.unitId,
          source: 'DIRECT',
          externalId: null,
          // Chosen by a person: nothing automatic will ever move it.
          unitAssignedManually: true,
          checkIn: fromIsoDate(input.checkIn),
          checkOut: fromIsoDate(input.checkOut),
          status: 'CONFIRMED',
          kind,
          guestName: details.guestName ?? null,
          guestEmail: details.guestEmail ?? null,
          guestPhone: details.guestPhone ?? null,
          numberOfGuests: details.numberOfGuests ?? null,
          notes: details.notes ?? null,
          billingName: details.billingName ?? null,
          billingNif: details.billingNif ?? null,
          billingAddress: details.billingAddress ?? null,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.ReservationCreated,
          entityType: 'Reservation',
          entityId: r.id,
          userId,
          metadata: {
            source: 'DIRECT',
            kind,
            unitId: input.unitId,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            ...(conflicts > 0 ? { conflictsAccepted: conflicts } : {}),
          },
        },
        tx,
      );
      return r;
    });
    return this.get(created.id);
  }

  /**
   * Edits a reservation.
   * - Any reservation: guest details, notes and billing (what a source does not
   *   provide). Guest fields saved here on an imported reservation are
   *   remembered so a later sync never overwrites them.
   * - Reservations created in the app (DIRECT) only: dates and unit, with the
   *   same overlap check as creation. Imported stays keep following their source.
   */
  async edit(id: string, input: EditReservationInput, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reservation not found');

    const next = normalizeDetails(input);
    const data: Prisma.ReservationUncheckedUpdateInput = {};
    const changed: string[] = [];
    const manual = new Set(reservation.manualFields);
    for (const key of DETAIL_KEYS) {
      const value = next[key];
      if (value === undefined || value === reservation[key]) continue;
      if (key === 'guestName' && value === null && reservation.source === 'DIRECT' && reservation.kind === 'STAY') {
        throw new BadRequestException('Enter the guest name');
      }
      (data as Record<string, unknown>)[key] = value;
      changed.push(key);
      // Only guest fields can come from a source; the rest are always local.
      if (reservation.source !== 'DIRECT' && (key === 'guestName' || key === 'guestEmail' || key === 'guestPhone' || key === 'numberOfGuests')) {
        manual.add(key);
      }
    }

    // Stay changes (dates, unit).
    const before = { checkIn: toIsoDate(reservation.checkIn), checkOut: toIsoDate(reservation.checkOut), unitId: reservation.unitId };
    const stay = {
      checkIn: input.checkIn ?? before.checkIn,
      checkOut: input.checkOut ?? before.checkOut,
      unitId: input.unitId ?? before.unitId,
    };
    const stayChanged = stay.checkIn !== before.checkIn || stay.checkOut !== before.checkOut || stay.unitId !== before.unitId;
    let conflicts = 0;
    if (stayChanged) {
      if (reservation.source !== 'DIRECT') {
        throw new BadRequestException(
          'The dates of an imported reservation come from its source. Use "Assign unit" to change the unit.',
        );
      }
      if (reservation.status === 'CANCELLED') throw new BadRequestException('A cancelled reservation cannot be changed');
      const problems = validateManualStay({ checkIn: stay.checkIn, checkOut: stay.checkOut, kind: 'BLOCK' });
      if (problems.length > 0) throw invalidInput(problems);
      if (!stay.unitId) throw new BadRequestException('Choose a unit');
      if (stay.unitId !== before.unitId) await this.assertUsableUnit(stay.unitId, reservation.propertyId);
      conflicts = await this.checkOverlaps({ id, ...stay, unitId: stay.unitId }, input.acceptConflicts);
      if (stay.checkIn !== before.checkIn) {
        data.checkIn = fromIsoDate(stay.checkIn);
        changed.push('checkIn');
      }
      if (stay.checkOut !== before.checkOut) {
        data.checkOut = fromIsoDate(stay.checkOut);
        changed.push('checkOut');
      }
      if (stay.unitId !== before.unitId) {
        data.unitId = stay.unitId;
        changed.push('unitId');
      }
    }

    if (changed.length === 0) return this.get(id);
    if (reservation.source !== 'DIRECT') data.manualFields = [...manual];

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data });
      await this.audit.record(
        {
          action: stayChanged ? AuditAction.ReservationUpdated : AuditAction.ReservationEdited,
          entityType: 'Reservation',
          entityId: id,
          userId,
          // Field names, and stay values (not personal); guest details stay out of the audit log.
          metadata: {
            changed,
            ...(stayChanged ? { before, after: stay } : {}),
            ...(conflicts > 0 ? { conflictsAccepted: conflicts } : {}),
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Cancels a reservation created in the app. Never deleted: it stays for
   * history. Imported reservations are cancelled by their source only.
   */
  async cancel(id: string, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.source !== 'DIRECT') {
      throw new BadRequestException('Imported reservations are cancelled at their source (e.g. Booking.com)');
    }
    if (reservation.status === 'CANCELLED') return this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        {
          action: AuditAction.ReservationCancelled,
          entityType: 'Reservation',
          entityId: id,
          userId,
          metadata: { source: 'DIRECT', previousStatus: 'CONFIRMED' },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Turns a reservation into blocked dates or back into a guest stay — e.g. a
   * Booking "CLOSED - Not available" entry that is really a closure. Allowed
   * for any source; synchronization never changes `kind` afterwards.
   */
  async setKind(id: string, kind: ReservationKind, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.kind === kind) return this.get(id);
    if (kind === 'STAY' && reservation.source === 'DIRECT' && !reservation.guestName) {
      throw new BadRequestException('Enter the guest name first ("Edit details"), then mark it as a guest stay');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data: { kind } });
      await this.audit.record(
        {
          action: AuditAction.ReservationKindChanged,
          entityType: 'Reservation',
          entityId: id,
          userId,
          metadata: { from: reservation.kind, to: kind },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async assertUsableUnit(unitId: string, propertyId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.propertyId !== propertyId) throw new BadRequestException('Choose a unit of this property');
    if (!unit.active) throw new BadRequestException('This unit is deactivated');
  }

  /**
   * Returns how many confirmed stays of the unit the candidate overlaps.
   * Throws 409 with those stays when there are any and they were not accepted.
   */
  private async checkOverlaps(
    candidate: { id?: string; unitId: string; checkIn: IsoDate; checkOut: IsoDate },
    accept = false,
  ): Promise<number> {
    const rows = await this.prisma.reservation.findMany({
      where: {
        unitId: candidate.unitId,
        status: 'CONFIRMED',
        checkIn: { lt: fromIsoDate(candidate.checkOut) },
        checkOut: { gt: fromIsoDate(candidate.checkIn) },
      },
      include: { unit: { select: { name: true } } },
      orderBy: { checkIn: 'asc' },
    });
    const overlapping = overlapsFor(
      candidate,
      rows.map((r) => ({ id: r.id, unitId: r.unitId, checkIn: toIsoDate(r.checkIn), checkOut: toIsoDate(r.checkOut), status: r.status })),
    );
    if (overlapping.length > 0 && !accept) {
      const byId = new Map(rows.map((r) => [r.id, r]));
      throw new ConflictException({
        message: 'This stay overlaps another reservation in the same unit',
        details: {
          conflicts: overlapping.map((o) => {
            const r = byId.get(o.id)!;
            return {
              id: r.id,
              guestName: r.guestName,
              unitName: r.unit?.name ?? null,
              checkIn: o.checkIn,
              checkOut: o.checkOut,
              source: r.source,
            };
          }),
        },
      });
    }
    return overlapping.length;
  }

  today(): IsoDate {
    return this.clock.today();
  }
}
