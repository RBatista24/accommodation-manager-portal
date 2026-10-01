import { Link } from 'react-router';
import { TriangleAlertIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { ReservationStatusBadge, SourceBadge } from '@/components/molecules/status-badges';
import { useReservationParam } from '@/hooks/use-reservation-param';
import { formatStay, nightsLabel } from '@/lib/dates';
import type { Reservation } from '@/lib/types';
import { reservationTitle } from '@/lib/reservations';
import { cn } from '@/lib/utils';

/** Table on larger screens, stacked cards on phones. */
export function ReservationTable({ reservations }: { reservations: Reservation[] }) {
  const { open, hrefFor } = useReservationParam();

  return (
    <>
      <div className="bg-card hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Guest</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Stay</TableHead>
              <TableHead className="text-right">Guests</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((r) => {
              const cancelled = r.status === 'CANCELLED';
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => open(r.id)}>
                  <TableCell className="pl-4">
                    <Link
                      to={hrefFor(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={cn('font-medium hover:underline', cancelled && 'text-muted-foreground line-through')}
                    >
                      {reservationTitle(r)}
                    </Link>
                    <div className="text-muted-foreground text-xs">{r.kind === 'BLOCK' ? (r.notes ?? r.externalId) : r.externalId}</div>
                  </TableCell>
                  <TableCell>
                    {r.unitName ?? (
                      <Badge variant="warning">
                        <TriangleAlertIcon /> Pending assignment
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={cn(cancelled && 'text-muted-foreground')}>
                    {formatStay(r.checkIn, r.checkOut)}
                    <span className="text-muted-foreground"> · {nightsLabel(r.nights)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.numberOfGuests ?? '—'}</TableCell>
                  <TableCell>
                    <SourceBadge source={r.source} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <ReservationStatusBadge reservation={r} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {reservations.map((r) => (
          <li key={r.id}>
            <Link to={hrefFor(r.id)} className="bg-card block rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn('truncate font-medium', r.status === 'CANCELLED' && 'text-muted-foreground line-through')}>
                    {reservationTitle(r)}
                  </div>
                  <div className="text-muted-foreground text-sm">{r.unitName ?? 'No unit assigned'}</div>
                </div>
                <ReservationStatusBadge reservation={r} />
              </div>
              <div className="text-muted-foreground mt-2 text-sm">
                {formatStay(r.checkIn, r.checkOut)} · {nightsLabel(r.nights)}
                {r.numberOfGuests ? ` · ${r.numberOfGuests} guests` : ''}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
