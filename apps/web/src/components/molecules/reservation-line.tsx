import { Link } from 'react-router';
import { ReservationStatusBadge } from '@/components/molecules/status-badges';
import { formatStay } from '@/lib/dates';
import type { Reservation } from '@/lib/types';

/** Compact one-line reservation for lists on the dashboard. */
export function ReservationLine({ reservation, meta }: { reservation: Reservation; meta?: string }) {
  return (
    <Link
      to={`/reservations/${reservation.id}`}
      className="hover:bg-muted/60 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{reservation.guestName ?? 'Guest name unavailable'}</div>
        <div className="text-muted-foreground truncate text-xs">
          {reservation.unitName ?? 'No unit assigned'} · {formatStay(reservation.checkIn, reservation.checkOut)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta && <span className="text-muted-foreground hidden text-xs sm:inline">{meta}</span>}
        {(reservation.pendingAssignment || reservation.hasConflict || reservation.status === 'CANCELLED') && (
          <ReservationStatusBadge reservation={reservation} />
        )}
      </div>
    </Link>
  );
}
