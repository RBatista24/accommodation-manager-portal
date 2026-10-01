import type { IsoDate } from '../domain/dates';
import type { NormalizedReservation, ReservationSource } from '../domain/reservation';
import type { SnapshotScope } from '../domain/snapshot-cancellation';

/**
 * Extension point for reservation sources (Booking today; Airbnb, direct and
 * others later). An adapter talks to ONE external system and translates its
 * data into NormalizedReservation. Nothing outside the adapter sees the
 * provider's own format.
 */
export interface ReservationSourceAdapter {
  readonly source: ReservationSource;
  /** Which mechanism this adapter uses, e.g. "mock" or "ical". */
  readonly mode: string;
  describe(): Promise<AdapterDescription>;
  fetchReservations(context: FetchContext): Promise<FetchResult>;
}

export interface FetchContext {
  /** Today's date in the property's timezone. */
  today: IsoDate;
}

export interface FetchResult {
  reservations: NormalizedReservation[];
  /**
   * External rooms for which `reservations` is the complete list of active
   * bookings. Used to detect cancellations for sources that do not report them.
   */
  snapshots: SnapshotScope[];
  /** Partial failures (e.g. one feed unreachable). Messages must be safe to show. */
  errors: { scope: string; message: string }[];
}

export interface AdapterDescription {
  /** True when the adapter has what it needs to run a synchronization. */
  configured: boolean;
  /** Short, user-facing explanation of the current configuration. */
  summary: string;
  /** Safe details only: never URLs with tokens, keys or passwords. */
  details: Record<string, unknown>;
}

/** Thrown when the source cannot be reached at all. The message is shown to users. */
export class SourceUnavailableError extends Error {
  constructor(
    public readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = 'SourceUnavailableError';
  }
}
