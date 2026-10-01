import * as React from 'react';
import { Button } from '@/components/atoms/button';
import { Input } from '@/components/atoms/input';
import { Spinner } from '@/components/atoms/spinner';
import { Textarea } from '@/components/atoms/textarea';
import { FormField } from '@/components/molecules/form-field';
import { useEditReservation } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { ReservationDetail } from '@/lib/types';

/** Fills in what the booking source does not provide: guest, contact and notes. */
export function ReservationEditForm({ reservation: r, onDone }: { reservation: ReservationDetail; onDone: () => void }) {
  const [name, setName] = React.useState(r.guestName ?? '');
  const [email, setEmail] = React.useState(r.guestEmail ?? '');
  const [phone, setPhone] = React.useState(r.guestPhone ?? '');
  const [guests, setGuests] = React.useState(r.numberOfGuests?.toString() ?? '');
  const [notes, setNotes] = React.useState(r.notes ?? '');
  const [billingName, setBillingName] = React.useState(r.billingName ?? '');
  const [billingNif, setBillingNif] = React.useState(r.billingNif ?? '');
  const [billingAddress, setBillingAddress] = React.useState(r.billingAddress ?? '');
  const edit = useEditReservation(r.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    edit.mutate(
      {
        guestName: name,
        guestEmail: email,
        guestPhone: phone,
        numberOfGuests: guests.trim() === '' ? null : Number(guests),
        notes,
        billingName,
        billingNif,
        billingAddress,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormField id="res-name" label="Guest name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="res-email" label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="off" />
        </FormField>
        <FormField id="res-phone" label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} autoComplete="off" />
        </FormField>
      </div>
      <FormField id="res-guests" label="Number of guests">
        <Input type="number" min={1} max={100} value={guests} onChange={(e) => setGuests(e.target.value)} className="sm:w-32" />
      </FormField>
      <FormField id="res-notes" label="Notes" hint="Only visible here. Booking.com never sees them.">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} />
      </FormField>
      <div role="group" aria-labelledby="res-billing" className="grid gap-4 border-t pt-4">
        <h4 id="res-billing" className="text-sm font-semibold">
          Billing
        </h4>
        <FormField id="res-billing-name" label="Name" hint="Leave empty to bill the guest.">
          <Input
            value={billingName}
            onChange={(e) => setBillingName(e.target.value)}
            placeholder={name || 'Same as guest'}
            maxLength={200}
            autoComplete="off"
          />
        </FormField>
        <FormField id="res-billing-nif" label="NIF / VAT number" hint="Portuguese NIF or a foreign VAT number, e.g. 123456789 or ESB12345678.">
          <Input
            value={billingNif}
            onChange={(e) => setBillingNif(e.target.value.toUpperCase())}
            maxLength={40}
            autoComplete="off"
            className="sm:w-64"
          />
        </FormField>
        <FormField id="res-billing-address" label="Address">
          <Textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} maxLength={500} />
        </FormField>
      </div>
      <p className="text-muted-foreground text-xs">
        {r.source === 'DIRECT'
          ? 'Use "Change stay" to move the dates or the unit.'
          : 'Dates and cancellations keep coming from Booking.com. Guest details you save here are never overwritten by a sync.'}
      </p>
      {edit.isError && <p className="text-destructive text-sm">{errorMessage(edit.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={edit.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={edit.isPending}>
          {edit.isPending && <Spinner />} Save
        </Button>
      </div>
    </form>
  );
}
