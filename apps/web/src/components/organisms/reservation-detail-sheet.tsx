import * as React from 'react';
import { BanIcon, CalendarClockIcon, CircleAlertIcon, PencilIcon, TriangleAlertIcon, CircleXIcon, UserRoundIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Button } from '@/components/atoms/button';
import { NativeSelect } from '@/components/atoms/native-select';
import { Separator } from '@/components/atoms/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/atoms/sheet';
import { Spinner } from '@/components/atoms/spinner';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { DetailList } from '@/components/molecules/detail-list';
import { QueryState } from '@/components/molecules/query-state';
import { ReservationStatusBadge, SourceBadge, sourceLabel } from '@/components/molecules/status-badges';
import { ReservationEditForm } from '@/components/organisms/reservation-edit-form';
import { StayEditForm } from '@/components/organisms/stay-edit-form';
import { useAssignUnit, useCancelReservation, useReservation, useSetReservationKind } from '@/hooks/queries';
import { reservationTitle } from '@/lib/reservations';
import { useReservationParam } from '@/hooks/use-reservation-param';
import { errorMessage } from '@/lib/api';
import { formatMedium, formatStay, formatTimestamp, nightsLabel } from '@/lib/dates';
import type { ReservationDetail } from '@/lib/types';

/** Mounted once in the app shell; opens whenever ?reservation=<id> is in the URL. */
export function ReservationDetailSheet() {
  const { current, close } = useReservationParam();
  const query = useReservation(current ?? undefined);

  return (
    <Sheet open={!!current} onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <QueryState
          query={query}
          loading={
            <SheetHeader>
              <SheetTitle>Loading reservation…</SheetTitle>
              <SheetDescription className="sr-only">Reservation details</SheetDescription>
              <Spinner className="mt-4" />
            </SheetHeader>
          }
        >
          {(r) => <ReservationDetailBody reservation={r} />}
        </QueryState>
      </SheetContent>
    </Sheet>
  );
}

function ReservationDetailBody({ reservation: r }: { reservation: ReservationDetail }) {
  const [editing, setEditing] = React.useState(false);
  const [editingStay, setEditingStay] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const cancel = useCancelReservation(r.id);
  // Reservations created in the app can be moved and cancelled here; imported ones follow their source.
  const isDirect = r.source === 'DIRECT';
  const canChangeStay = isDirect && r.status === 'CONFIRMED';
  const isBlock = r.kind === 'BLOCK';
  const setKind = useSetReservationKind(r.id);
  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle className="text-lg">{reservationTitle(r)}</SheetTitle>
        <SheetDescription>
          {formatStay(r.checkIn, r.checkOut)} · {nightsLabel(r.nights)}
          {isBlock && r.notes ? ` · ${r.notes}` : ''}
        </SheetDescription>
        <div className="flex flex-wrap gap-2">
          <ReservationStatusBadge reservation={{ ...r, hasConflict: r.conflicts.length > 0 }} />
          <SourceBadge source={r.source} />
        </div>
      </SheetHeader>

      <div className="grid gap-5 p-4">
        {r.pendingAssignment && r.status === 'CONFIRMED' && <AssignUnit reservation={r} />}

        {r.conflicts.map((c) => {
          const other = c.reservations.find((x) => x.id !== r.id);
          return (
            <Alert key={`${c.unitId}-${other?.id}`} variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Reservation conflict</AlertTitle>
              <AlertDescription>
                <p>
                  {c.unitName} is also {other?.kind === 'BLOCK' ? 'blocked' : `booked by ${other?.guestName ?? 'another guest'}`} (
                  {other && formatStay(other.checkIn, other.checkOut)}). The stays overlap from {formatStay(c.overlapFrom, c.overlapTo)}.
                </p>
              </AlertDescription>
            </Alert>
          );
        })}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{isBlock ? 'Blocked dates' : 'Guest'}</h3>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit details
              </Button>
            )}
          </div>
          {editing ? (
            <ReservationEditForm reservation={r} onDone={() => setEditing(false)} />
          ) : (
            <DetailList
              items={
                isBlock
                  ? [['Reason', r.notes]]
                  : [
                      ['Name', r.guestName],
                      ['Email', r.guestEmail],
                      ['Phone', r.guestPhone],
                      ['Guests', r.numberOfGuests],
                      ['Notes', r.notes],
                    ]
              }
            />
          )}
        </section>
        {!editing && !isBlock && (
          <>
            <Separator />
            <section>
              <h3 className="mb-3 text-sm font-semibold">Billing</h3>
              <DetailList
                items={[
                  [
                    'Name',
                    r.billingName ??
                      (r.guestName ? (
                        <>
                          {r.guestName} <span className="text-muted-foreground">(same as guest)</span>
                        </>
                      ) : null),
                  ],
                  ['NIF / VAT', r.billingNif],
                  ['Address', r.billingAddress ? <span className="whitespace-pre-line">{r.billingAddress}</span> : null],
                ]}
              />
            </section>
          </>
        )}
        <Separator />
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Stay</h3>
            {canChangeStay && !editingStay && (
              <Button variant="outline" size="sm" onClick={() => setEditingStay(true)}>
                <CalendarClockIcon /> Change stay
              </Button>
            )}
          </div>
          {editingStay ? (
            <StayEditForm reservation={r} onDone={() => setEditingStay(false)} />
          ) : (
            <DetailList
              items={[
                ['Property', r.propertyName],
                [
                  'Unit',
                  r.unitName ? (
                    <>
                      {r.unitName}
                      {r.unitAssignedManually && !isDirect && <span className="text-muted-foreground"> (assigned by hand)</span>}
                    </>
                  ) : (
                    <span className="text-warning">Pending assignment</span>
                  ),
                ],
                ['Check-in', formatMedium(r.checkIn)],
                ['Check-out', formatMedium(r.checkOut)],
                ['Duration', nightsLabel(r.nights)],
                [
                  'Type',
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {isBlock ? 'Blocked dates' : 'Guest stay'}
                    {r.status === 'CONFIRMED' && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        disabled={setKind.isPending}
                        onClick={() => setKind.mutate(isBlock ? 'STAY' : 'BLOCK')}
                      >
                        {isBlock ? <UserRoundIcon /> : <BanIcon />}
                        {isBlock ? 'Mark as guest stay' : 'Mark as blocked dates'}
                      </Button>
                    )}
                  </span>,
                ],
              ]}
            />
          )}
          {setKind.isError && <p className="text-destructive mt-2 text-sm">{errorMessage(setKind.error)}</p>}
          {!isDirect && !isBlock && !r.guestName && r.status === 'CONFIRMED' && (
            <p className="text-muted-foreground mt-2 text-xs">
              Booking shows both reservations and closed dates as "Not available". If this is a closure, mark it as blocked dates.
            </p>
          )}
        </section>
        <Separator />
        <section>
          <h3 className="mb-3 text-sm font-semibold">Source</h3>
          <DetailList
            items={[
              ['Source', sourceLabel(r.source)],
              ['Reservation ID', r.externalId ? <code className="text-xs">{r.externalId}</code> : null],
              ['Status', r.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed'],
              ['Created', formatTimestamp(r.createdAt)],
              ['Last updated', formatTimestamp(r.updatedAt)],
              ['Last synchronized', formatTimestamp(r.lastSyncedAt)],
            ]}
          />
        </section>
        {canChangeStay && (
          <>
            <Separator />
            <section className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                {isBlock ? 'Open these dates again? The block is kept in the history as cancelled.' : 'Guest no longer coming? The reservation is kept as cancelled.'}
              </p>
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                <CircleXIcon /> {isBlock ? 'Remove block' : 'Cancel reservation'}
              </Button>
            </section>
            <ConfirmDialog
              open={confirmCancel}
              onOpenChange={(o) => {
                setConfirmCancel(o);
                if (!o) cancel.reset();
              }}
              title={isBlock ? 'Remove these blocked dates?' : 'Cancel this reservation?'}
              description={`${isBlock ? 'Blocked dates' : (r.guestName ?? 'This guest')} · ${formatStay(r.checkIn, r.checkOut)}. It stays in the history as cancelled and frees the unit. This cannot be undone.`}
              confirmLabel={isBlock ? 'Remove block' : 'Cancel reservation'}
              destructive
              pending={cancel.isPending}
              error={cancel.isError ? errorMessage(cancel.error) : null}
              onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setConfirmCancel(false) })}
            />
          </>
        )}
        {r.history.length > 0 && (
          <>
            <Separator />
            <section>
              <h3 className="mb-3 text-sm font-semibold">History</h3>
              <ol className="grid gap-2.5">
                {r.history.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-3 text-sm">
                    <span>{describeAction(h.action, !!h.user)}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatTimestamp(h.timestamp)}
                      {h.user && ` · ${h.user.name}`}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function AssignUnit({ reservation }: { reservation: ReservationDetail }) {
  const [unitId, setUnitId] = React.useState('');
  const assign = useAssignUnit(reservation.id);

  return (
    <Alert variant="warning">
      <CircleAlertIcon />
      <AlertTitle>Unit pending assignment</AlertTitle>
      <AlertDescription>
        <p>This reservation came from a room that is not linked to a unit. Choose the unit for this stay.</p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
          <NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Unit" className="bg-background rounded-md">
            <option value="">Choose a unit…</option>
            {reservation.assignableUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => assign.mutate(unitId)} disabled={!unitId || assign.isPending}>
            {assign.isPending && <Spinner />} Assign unit
          </Button>
        </div>
        {assign.isError && <p className="text-destructive">{errorMessage(assign.error)}</p>}
      </AlertDescription>
    </Alert>
  );
}

// Rows without a user were written by synchronization; rows with a user by a person.
const BY_SYNC: Record<string, string> = {
  RESERVATION_CREATED: 'Imported',
  RESERVATION_UPDATED: 'Updated by sync',
  RESERVATION_CANCELLED: 'Cancelled at the source',
};
const BY_PERSON: Record<string, string> = {
  RESERVATION_CREATED: 'Created',
  RESERVATION_UPDATED: 'Stay changed',
  RESERVATION_CANCELLED: 'Cancelled',
  RESERVATION_UNIT_ASSIGNED: 'Unit assigned by hand',
  RESERVATION_EDITED: 'Details edited',
  RESERVATION_KIND_CHANGED: 'Type changed',
};

function describeAction(action: string, byPerson: boolean): string {
  return (byPerson ? BY_PERSON : BY_SYNC)[action] ?? BY_PERSON[action] ?? action.toLowerCase().replace(/_/g, ' ');
}
