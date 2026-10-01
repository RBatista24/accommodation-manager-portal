import type { Reservation } from '@prisma/client';
import { nightsBetween, toIsoDate } from '../../domain/dates';

export type ReservationWithNames = Reservation & {
  property?: { id: string; name: string } | null;
  unit?: { id: string; name: string; active?: boolean } | null;
};

export function presentReservation(r: ReservationWithNames, conflictIds?: ReadonlySet<string>) {
  const checkIn = toIsoDate(r.checkIn);
  const checkOut = toIsoDate(r.checkOut);
  return {
    id: r.id,
    propertyId: r.propertyId,
    propertyName: r.property?.name ?? null,
    unitId: r.unitId,
    unitName: r.unit?.name ?? null,
    source: r.source,
    externalId: r.externalId,
    externalUnitRef: r.externalUnitRef,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestPhone: r.guestPhone,
    checkIn,
    checkOut,
    nights: nightsBetween(checkIn, checkOut),
    numberOfGuests: r.numberOfGuests,
    status: r.status,
    notes: r.notes,
    billingName: r.billingName,
    billingNif: r.billingNif,
    billingAddress: r.billingAddress,
    pendingAssignment: r.unitId === null,
    unitAssignedManually: r.unitAssignedManually,
    manualFields: r.manualFields,
    hasConflict: conflictIds ? conflictIds.has(r.id) : undefined,
    lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
