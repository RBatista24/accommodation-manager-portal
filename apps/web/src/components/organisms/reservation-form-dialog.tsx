import * as React from 'react';
import { Button } from '@/components/atoms/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/atoms/dialog';
import { Input } from '@/components/atoms/input';
import { NativeSelect } from '@/components/atoms/native-select';
import { Spinner } from '@/components/atoms/spinner';
import { Textarea } from '@/components/atoms/textarea';
import { FormField } from '@/components/molecules/form-field';
import { OverlapWarning } from '@/components/molecules/overlap-warning';
import { useCreateReservation, useProperties } from '@/hooks/queries';
import { useReservationParam } from '@/hooks/use-reservation-param';
import { errorMessage, overlapsOf, type NewReservation } from '@/lib/api';
import { addDays, daysBetween, isoValid, nightsLabel, todayLocal } from '@/lib/dates';
import type { ReservationKind } from '@/lib/types';
import { cn } from '@/lib/utils';

/** "New reservation": a stay typed in by hand (source Direct). */
export function ReservationFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const properties = useProperties();
  const create = useCreateReservation();
  const { open: openReservation } = useReservationParam();

  const empty = React.useMemo(
    () => ({
      kind: 'STAY' as ReservationKind,
      propertyId: '',
      unitId: '',
      checkIn: todayLocal(),
      checkOut: addDays(todayLocal(), 1),
      guestName: '',
      guestEmail: '',
      guestPhone: '',
      guests: '',
      notes: '',
      billingName: '',
      billingNif: '',
      billingAddress: '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );
  const [f, setF] = React.useState(empty);
  const [touched, setTouched] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: k === 'billingNif' ? e.target.value.toUpperCase() : e.target.value }));

  const activeProperties = (properties.data ?? []).filter((p) => p.active);
  const propertyId = f.propertyId || (activeProperties.length === 1 ? activeProperties[0]!.id : '');
  const units = activeProperties.find((p) => p.id === propertyId)?.units.filter((u) => u.active) ?? [];

  React.useEffect(() => {
    if (open) {
      setF(empty);
      setTouched(false);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Any change after a refused save clears the old error (and the overlap warning).
  React.useEffect(() => {
    if (create.isError) create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const datesValid = isoValid(f.checkIn) && isoValid(f.checkOut);
  const nights = datesValid ? daysBetween(f.checkIn, f.checkOut) : 0;
  const errors = {
    propertyId: !propertyId ? 'Choose a property' : null,
    unitId: !f.unitId ? 'Choose a unit' : null,
    checkIn: !isoValid(f.checkIn) ? 'Choose a date' : null,
    checkOut: !isoValid(f.checkOut) ? 'Choose a date' : datesValid && nights < 1 ? 'Must be after check-in' : null,
    guestName: f.kind === 'STAY' && !f.guestName.trim() ? 'Enter the guest name' : null,
    guests: f.kind === 'STAY' && f.guests && (!/^\d+$/.test(f.guests) || +f.guests < 1 || +f.guests > 100) ? 'Between 1 and 100' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const overlaps = overlapsOf(create.error);

  function submit(acceptConflicts: boolean) {
    setTouched(true);
    if (invalid) return;
    const stay = { propertyId, unitId: f.unitId, checkIn: f.checkIn, checkOut: f.checkOut, notes: f.notes, acceptConflicts };
    const body: NewReservation =
      f.kind === 'BLOCK'
        ? { ...stay, kind: 'BLOCK' }
        : {
            ...stay,
            kind: 'STAY',
            guestName: f.guestName.trim(),
            guestEmail: f.guestEmail,
            guestPhone: f.guestPhone,
            numberOfGuests: f.guests ? Number(f.guests) : null,
            billingName: f.billingName,
            billingNif: f.billingNif,
            billingAddress: f.billingAddress,
          };
    create.mutate(body, {
      onSuccess: (r) => {
        onOpenChange(false);
        openReservation(r.id);
      },
    });
  }

  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>New reservation</DialogTitle>
            <DialogDescription>
              {f.kind === 'STAY'
                ? 'A stay booked directly with you, not through Booking.com.'
                : 'Close a unit for some nights — your own use, maintenance, anything without a guest.'}
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="Type" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {(
              [
                ['STAY', 'Guest stay'],
                ['BLOCK', 'Blocked dates'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={f.kind === value}
                onClick={() => setF((p) => ({ ...p, kind: value }))}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
                  f.kind === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {activeProperties.length > 1 && (
              <FormField id="new-property" label="Property" error={err('propertyId')}>
                <NativeSelect value={propertyId} onChange={(e) => setF((p) => ({ ...p, propertyId: e.target.value, unitId: '' }))}>
                  <option value="">Choose…</option>
                  {activeProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
            <FormField id="new-unit" label="Unit" error={err('unitId')}>
              <NativeSelect value={f.unitId} onChange={set('unitId')} disabled={!propertyId}>
                <option value="">Choose…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <div className="grid grid-cols-2 items-start gap-4">
            <FormField id="new-check-in" label="Check-in" error={err('checkIn')}>
              <Input
                type="date"
                value={f.checkIn}
                onChange={(e) => {
                  const v = e.target.value;
                  // Keep at least one night when the check-in moves past the check-out.
                  setF((p) => ({ ...p, checkIn: v, checkOut: isoValid(v) && p.checkOut <= v ? addDays(v, 1) : p.checkOut }));
                }}
              />
            </FormField>
            <FormField id="new-check-out" label="Check-out" error={err('checkOut')} hint={nights > 0 ? nightsLabel(nights) : undefined}>
              <Input type="date" value={f.checkOut} min={isoValid(f.checkIn) ? addDays(f.checkIn, 1) : undefined} onChange={set('checkOut')} />
            </FormField>
          </div>

          {f.kind === 'STAY' && (
            <>
          <FormField id="new-guest" label="Guest name" error={err('guestName')}>
            <Input value={f.guestName} onChange={set('guestName')} maxLength={200} autoComplete="off" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
            <FormField id="new-email" label="Email">
              <Input type="email" value={f.guestEmail} onChange={set('guestEmail')} maxLength={200} autoComplete="off" />
            </FormField>
            <FormField id="new-phone" label="Phone">
              <Input type="tel" value={f.guestPhone} onChange={set('guestPhone')} maxLength={50} autoComplete="off" />
            </FormField>
            <FormField id="new-guests" label="Guests" error={err('guests')}>
              <Input type="number" min={1} max={100} value={f.guests} onChange={set('guests')} />
            </FormField>
          </div>
            </>
          )}
          <FormField id="new-notes" label={f.kind === 'BLOCK' ? 'Reason (optional)' : 'Notes'}>
            <Textarea value={f.notes} onChange={set('notes')} rows={2} maxLength={4000} />
          </FormField>

          {f.kind === 'STAY' && (
          <div role="group" aria-labelledby="new-billing" className="grid gap-4 border-t pt-4">
            <h3 id="new-billing" className="text-sm font-semibold">
              Billing <span className="text-muted-foreground font-normal">(optional)</span>
            </h3>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <FormField id="new-billing-name" label="Name" hint="Leave empty to bill the guest.">
                <Input value={f.billingName} onChange={set('billingName')} placeholder={f.guestName || 'Same as guest'} maxLength={200} autoComplete="off" />
              </FormField>
              <FormField id="new-billing-nif" label="NIF / VAT number">
                <Input value={f.billingNif} onChange={set('billingNif')} maxLength={40} autoComplete="off" />
              </FormField>
            </div>
            <FormField id="new-billing-address" label="Address">
              <Textarea value={f.billingAddress} onChange={set('billingAddress')} rows={2} maxLength={500} />
            </FormField>
          </div>
          )}

          {overlaps ? (
            <OverlapWarning overlaps={overlaps} />
          ) : (
            create.isError && <p className="text-destructive text-sm">{errorMessage(create.error)}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {overlaps ? (
              <Button type="button" variant="destructive" disabled={create.isPending} onClick={() => submit(true)}>
                {create.isPending && <Spinner />} Create anyway
              </Button>
            ) : (
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Spinner />} {f.kind === 'STAY' ? 'Create reservation' : 'Block dates'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
