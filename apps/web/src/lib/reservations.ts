import type { Reservation } from './types';

/** The main line a person reads for a reservation: the guest, or "Blocked dates". */
export function reservationTitle(r: Pick<Reservation, 'guestName'> & { kind?: Reservation['kind'] }): string {
  if (r.kind === 'BLOCK') return 'Blocked dates';
  return r.guestName ?? 'Guest name unavailable';
}

/** Short label for tight spaces such as calendar bars. */
export function reservationShortTitle(r: Pick<Reservation, 'guestName'> & { kind?: Reservation['kind'] }): string {
  if (r.kind === 'BLOCK') return 'Blocked';
  return r.guestName ?? 'Guest';
}
