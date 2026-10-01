import type { IsoDate } from './dates';
import type { ReservationSource } from './reservation';

/**
 * Some sources (iCal feeds) do not report cancellations: a cancelled booking
 * just disappears from the feed. An adapter that returns the COMPLETE list of
 * active reservations for an external room declares it with a snapshot scope.
 * Anything stored for that room that is still upcoming but missing from the
 * snapshot was cancelled at the source.
 */
export interface SnapshotScope {
  source: ReservationSource;
  externalPropertyId: string;
  externalUnitId: string;
  /** Only stays that end after this date are covered by the snapshot. */
  coversStaysEndingAfter: IsoDate;
  /** External ids present in the snapshot. */
  presentExternalIds: ReadonlySet<string>;
}

export interface SnapshotCandidate {
  id: string;
  externalId: string | null;
  checkOut: IsoDate;
  status: 'CONFIRMED' | 'CANCELLED';
}

export interface SnapshotCancellationResult {
  toCancel: string[];
  /** Set when the snapshot looks unsafe to act on. Nothing is cancelled then. */
  skippedReason: string | null;
}

/**
 * Returns the ids of stored reservations (already filtered to this scope's
 * source and external room) that must be marked CANCELLED.
 *
 * Safety: an EMPTY snapshot while upcoming reservations exist is more likely a
 * provider glitch than every guest cancelling at once, so nothing is cancelled
 * and the caller reports it instead.
 */
export function reservationsMissingFromSnapshot(
  scope: SnapshotScope,
  stored: readonly SnapshotCandidate[],
): SnapshotCancellationResult {
  const upcoming = stored.filter(
    (r) => r.status === 'CONFIRMED' && r.externalId !== null && r.checkOut > scope.coversStaysEndingAfter,
  );
  const missing = upcoming.filter((r) => !scope.presentExternalIds.has(r.externalId!));

  if (scope.presentExternalIds.size === 0 && missing.length > 0) {
    return {
      toCancel: [],
      skippedReason: `Feed returned no reservations while ${missing.length} upcoming reservation(s) exist; not treating them as cancelled`,
    };
  }
  return { toCancel: missing.map((r) => r.id), skippedReason: null };
}
