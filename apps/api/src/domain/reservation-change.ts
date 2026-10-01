import type { NormalizedReservation, StoredReservation, ReservationStatus } from './reservation';

export type SyncedFields = Pick<
  StoredReservation,
  | 'propertyId'
  | 'unitId'
  | 'externalPropertyRef'
  | 'externalUnitRef'
  | 'guestName'
  | 'guestEmail'
  | 'guestPhone'
  | 'checkIn'
  | 'checkOut'
  | 'numberOfGuests'
  | 'status'
>;

export type ReservationChangePlan =
  | { kind: 'create'; data: SyncedFields }
  | {
      kind: 'update';
      changes: Partial<SyncedFields>;
      changedFields: (keyof SyncedFields)[];
      /** Status transition, if any, so it can be audited and counted separately. */
      transition: 'cancelled' | 'reinstated' | null;
    }
  | { kind: 'unchanged' };

/**
 * Decides what synchronization must do with one incoming reservation.
 * Pure: no I/O, so the rules are easy to test and reason about.
 *
 * - Not stored yet -> create.
 * - Stored -> update only the fields that actually changed.
 * - Fields the source does not provide (undefined) never overwrite local data.
 * - A unit assigned by hand is never changed by synchronization.
 * - Guest fields edited by hand (manualFields) are never changed either.
 * - Cancellation is a status change; nothing is ever deleted.
 */
export function planReservationChange(
  existing: StoredReservation | null,
  incoming: NormalizedReservation,
  assignment: { propertyId: string; unitId: string | null },
): ReservationChangePlan {
  if (!existing) {
    return {
      kind: 'create',
      data: {
        propertyId: assignment.propertyId,
        unitId: assignment.unitId,
        externalPropertyRef: incoming.externalPropertyId,
        externalUnitRef: incoming.externalUnitId,
        guestName: incoming.guestName ?? null,
        guestEmail: incoming.guestEmail ?? null,
        guestPhone: incoming.guestPhone ?? null,
        checkIn: incoming.checkIn,
        checkOut: incoming.checkOut,
        numberOfGuests: incoming.numberOfGuests ?? null,
        status: incoming.status,
      },
    };
  }

  const target: Partial<SyncedFields> = {
    externalPropertyRef: incoming.externalPropertyId,
    externalUnitRef: incoming.externalUnitId,
    checkIn: incoming.checkIn,
    checkOut: incoming.checkOut,
    status: incoming.status,
  };
  if (!existing.unitAssignedManually) {
    target.propertyId = assignment.propertyId;
    target.unitId = assignment.unitId;
  }
  const edited = new Set(existing.manualFields);
  if (incoming.guestName !== undefined && !edited.has('guestName')) target.guestName = incoming.guestName;
  if (incoming.guestEmail !== undefined && !edited.has('guestEmail')) target.guestEmail = incoming.guestEmail;
  if (incoming.guestPhone !== undefined && !edited.has('guestPhone')) target.guestPhone = incoming.guestPhone;
  if (incoming.numberOfGuests !== undefined && !edited.has('numberOfGuests')) {
    target.numberOfGuests = incoming.numberOfGuests;
  }

  const changes: Partial<SyncedFields> = {};
  const changedFields: (keyof SyncedFields)[] = [];
  for (const key of Object.keys(target) as (keyof SyncedFields)[]) {
    if (target[key] !== existing[key]) {
      (changes as Record<string, unknown>)[key] = target[key];
      changedFields.push(key);
    }
  }

  if (changedFields.length === 0) return { kind: 'unchanged' };
  return {
    kind: 'update',
    changes,
    changedFields,
    transition: statusTransition(existing.status, incoming.status),
  };
}

function statusTransition(from: ReservationStatus, to: ReservationStatus): 'cancelled' | 'reinstated' | null {
  if (from === 'CONFIRMED' && to === 'CANCELLED') return 'cancelled';
  if (from === 'CANCELLED' && to === 'CONFIRMED') return 'reinstated';
  return null;
}
