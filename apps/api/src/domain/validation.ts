import { isIsoDate } from './dates';
import { RESERVATION_SOURCES, RESERVATION_STATUSES, type NormalizedReservation } from './reservation';

/** Returns a list of problems; empty means the reservation can be imported. */
export function validateNormalizedReservation(r: NormalizedReservation): string[] {
  const problems: string[] = [];
  if (!RESERVATION_SOURCES.includes(r.source)) problems.push(`Unknown source "${r.source}"`);
  if (!r.externalId || !r.externalId.trim()) problems.push('Missing external reservation id');
  if (!r.externalPropertyId || !r.externalPropertyId.trim()) problems.push('Missing external property id');
  if (!r.externalUnitId || !r.externalUnitId.trim()) problems.push('Missing external unit id');
  if (!isIsoDate(r.checkIn)) problems.push(`Invalid check-in date "${r.checkIn}"`);
  if (!isIsoDate(r.checkOut)) problems.push(`Invalid check-out date "${r.checkOut}"`);
  if (isIsoDate(r.checkIn) && isIsoDate(r.checkOut) && r.checkOut <= r.checkIn) {
    problems.push('Check-out must be after check-in');
  }
  if (!RESERVATION_STATUSES.includes(r.status)) problems.push(`Unknown status "${r.status}"`);
  if (r.numberOfGuests != null && (!Number.isInteger(r.numberOfGuests) || r.numberOfGuests < 1)) {
    problems.push(`Invalid number of guests "${r.numberOfGuests}"`);
  }
  return problems;
}
