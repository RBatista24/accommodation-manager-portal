import { Badge } from '@/components/atoms/badge';
import type { Reservation, ReservationSource, SyncStatus } from '@/lib/types';

/** The single most important state of a reservation, as the operator sees it. */
export function ReservationStatusBadge({
  reservation,
}: {
  reservation: Pick<Reservation, 'status' | 'pendingAssignment' | 'hasConflict'> & { kind?: Reservation['kind'] };
}) {
  if (reservation.status === 'CANCELLED') return <Badge variant="secondary">Cancelled</Badge>;
  if (reservation.pendingAssignment) return <Badge variant="warning">Pending unit</Badge>;
  if (reservation.hasConflict) return <Badge variant="destructive">Conflict</Badge>;
  if (reservation.kind === 'BLOCK') return <Badge variant="outline">Blocked</Badge>;
  return <Badge variant="success">Confirmed</Badge>;
}

const SOURCE_LABELS: Record<ReservationSource, string> = {
  BOOKING: 'Booking.com',
  AIRBNB: 'Airbnb',
  DIRECT: 'Direct',
  OTHER: 'Other',
};

export function sourceLabel(source: ReservationSource): string {
  return SOURCE_LABELS[source] ?? source;
}

export function SourceBadge({ source }: { source: ReservationSource }) {
  return <Badge variant="outline">{sourceLabel(source)}</Badge>;
}

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  switch (status) {
    case 'SUCCESS':
      return <Badge variant="success">Successful</Badge>;
    case 'PARTIAL':
      return <Badge variant="warning">Completed with problems</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">Failed</Badge>;
    case 'RUNNING':
      return <Badge variant="info">Running</Badge>;
  }
}
