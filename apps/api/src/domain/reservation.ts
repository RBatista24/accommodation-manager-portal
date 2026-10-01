import type { IsoDate } from './dates';

/**
 * Controlled values. They mirror the PostgreSQL enums, but the domain declares
 * them itself so it does not depend on the persistence layer.
 */
export const RESERVATION_SOURCES = ['BOOKING', 'AIRBNB', 'DIRECT', 'OTHER'] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const RESERVATION_STATUSES = ['CONFIRMED', 'CANCELLED'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * A reservation as delivered by ANY integration adapter, already translated
 * out of the provider's own format. This is the only shape the domain and the
 * sync runner know about; provider DTOs never leave their adapter.
 *
 * For optional fields, `undefined` means "this source does not provide it"
 * (keep whatever we have), while `null` means "the source says it is empty".
 */
export interface NormalizedReservation {
  source: ReservationSource;
  externalId: string;
  /** The external system's identifier of the property (e.g. Booking hotel id). */
  externalPropertyId: string;
  /** The external system's identifier of the room/unit. */
  externalUnitId: string;
  /** Human-readable name of the external room, for the mapping screen. */
  externalUnitName?: string;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  checkIn: IsoDate;
  checkOut: IsoDate;
  numberOfGuests?: number | null;
  status: ReservationStatus;
}

/** The fields of a stored reservation that synchronization reads and writes. */
export interface StoredReservation {
  id: string;
  propertyId: string;
  unitId: string | null;
  unitAssignedManually: boolean;
  /** Guest fields edited by hand; synchronization leaves them alone. */
  manualFields: string[];
  externalPropertyRef: string | null;
  externalUnitRef: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: IsoDate;
  checkOut: IsoDate;
  numberOfGuests: number | null;
  status: ReservationStatus;
}
