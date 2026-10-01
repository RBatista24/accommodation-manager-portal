import { TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { sourceLabel } from '@/components/molecules/status-badges';
import type { OverlappingStay } from '@/lib/api';
import { formatStay } from '@/lib/dates';
import type { ReservationSource } from '@/lib/types';

/** Shown when the API refused a save because the stay overlaps others (409). */
export function OverlapWarning({ overlaps }: { overlaps: OverlappingStay[] }) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>This stay overlaps {overlaps.length === 1 ? 'another reservation' : `${overlaps.length} reservations`}</AlertTitle>
      <AlertDescription>
        <ul className="grid gap-1">
          {overlaps.map((o) => (
            <li key={o.id}>
              {o.guestName ?? 'Guest name unavailable'} · {o.unitName} · {formatStay(o.checkIn, o.checkOut)} ·{' '}
              {sourceLabel(o.source as ReservationSource)}
            </li>
          ))}
        </ul>
        <p>Change the dates or unit, or save anyway — the conflict will stay visible.</p>
      </AlertDescription>
    </Alert>
  );
}
