import { staysOverlap, type IsoDate } from './dates';
import type { ReservationStatus } from './reservation';

export interface StayLike {
  id: string;
  unitId: string | null;
  checkIn: IsoDate;
  checkOut: IsoDate;
  status: ReservationStatus;
}

export interface ReservationConflict {
  unitId: string;
  reservationIds: [string, string];
  /** The nights both reservations claim: [from, to) */
  overlapFrom: IsoDate;
  overlapTo: IsoDate;
}

/**
 * Two reservations conflict when they are both confirmed, assigned to the same
 * unit, and their stays overlap (check-in inclusive, check-out exclusive).
 * Cancelled and unassigned reservations never conflict.
 */
export function detectConflicts(stays: readonly StayLike[]): ReservationConflict[] {
  const byUnit = new Map<string, StayLike[]>();
  for (const s of stays) {
    if (s.status !== 'CONFIRMED' || !s.unitId) continue;
    const list = byUnit.get(s.unitId) ?? [];
    list.push(s);
    byUnit.set(s.unitId, list);
  }

  const conflicts: ReservationConflict[] = [];
  for (const [unitId, list] of byUnit) {
    list.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.id < b.id ? -1 : 1));
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        // Sorted by check-in: once b starts after a ends, no later one overlaps a.
        if (b.checkIn >= a.checkOut) break;
        if (staysOverlap(a, b)) {
          conflicts.push({
            unitId,
            reservationIds: [a.id, b.id],
            overlapFrom: a.checkIn > b.checkIn ? a.checkIn : b.checkIn,
            overlapTo: a.checkOut < b.checkOut ? a.checkOut : b.checkOut,
          });
        }
      }
    }
  }
  return conflicts;
}

export function conflictingIds(conflicts: readonly ReservationConflict[]): Set<string> {
  return new Set(conflicts.flatMap((c) => c.reservationIds));
}

/**
 * The confirmed stays of `others` that a candidate stay would overlap on the
 * same unit. Used before saving a manual reservation or a date/unit change,
 * so the user can be warned. The candidate itself (same id) is ignored.
 */
export function overlapsFor(
  candidate: { id?: string; unitId: string; checkIn: IsoDate; checkOut: IsoDate },
  others: readonly StayLike[],
): StayLike[] {
  return others.filter(
    (o) =>
      o.status === 'CONFIRMED' &&
      o.unitId === candidate.unitId &&
      o.id !== candidate.id &&
      staysOverlap(candidate, o),
  );
}
