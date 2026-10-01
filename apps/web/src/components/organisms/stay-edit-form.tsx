import * as React from 'react';
import { Button } from '@/components/atoms/button';
import { Input } from '@/components/atoms/input';
import { NativeSelect } from '@/components/atoms/native-select';
import { Spinner } from '@/components/atoms/spinner';
import { FormField } from '@/components/molecules/form-field';
import { OverlapWarning } from '@/components/molecules/overlap-warning';
import { useEditReservation } from '@/hooks/queries';
import { errorMessage, overlapsOf } from '@/lib/api';
import { addDays, daysBetween, isoValid, nightsLabel } from '@/lib/dates';
import type { ReservationDetail } from '@/lib/types';

/** Change dates and unit of a reservation created in the app (source Direct). */
export function StayEditForm({ reservation: r, onDone }: { reservation: ReservationDetail; onDone: () => void }) {
  const [checkIn, setCheckIn] = React.useState(r.checkIn);
  const [checkOut, setCheckOut] = React.useState(r.checkOut);
  const [unitId, setUnitId] = React.useState(r.unitId ?? '');
  const edit = useEditReservation(r.id);

  React.useEffect(() => {
    if (edit.isError) edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, unitId]);

  const valid = isoValid(checkIn) && isoValid(checkOut) && checkOut > checkIn && !!unitId;
  const nights = isoValid(checkIn) && isoValid(checkOut) ? daysBetween(checkIn, checkOut) : 0;
  const overlaps = overlapsOf(edit.error);
  // The current unit may be deactivated; keep it selectable so nothing changes by accident.
  const units = r.assignableUnits.some((u) => u.id === r.unitId) || !r.unitId
    ? r.assignableUnits
    : [{ id: r.unitId, name: r.unitName ?? 'Current unit' }, ...r.assignableUnits];

  const save = (acceptConflicts: boolean) =>
    edit.mutate({ checkIn, checkOut, unitId, acceptConflicts }, { onSuccess: onDone });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save(false);
      }}
    >
      <div className="grid grid-cols-2 items-start gap-4">
        <FormField id="stay-check-in" label="Check-in">
          <Input
            type="date"
            value={checkIn}
            onChange={(e) => {
              const v = e.target.value;
              setCheckIn(v);
              if (isoValid(v) && checkOut <= v) setCheckOut(addDays(v, 1));
            }}
          />
        </FormField>
        <FormField
          id="stay-check-out"
          label="Check-out"
          hint={nights > 0 ? nightsLabel(nights) : undefined}
          error={isoValid(checkIn) && isoValid(checkOut) && checkOut <= checkIn ? 'Must be after check-in' : null}
        >
          <Input type="date" value={checkOut} min={isoValid(checkIn) ? addDays(checkIn, 1) : undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </FormField>
      </div>
      <FormField id="stay-unit" label="Unit">
        <NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {overlaps ? <OverlapWarning overlaps={overlaps} /> : edit.isError && <p className="text-destructive text-sm">{errorMessage(edit.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={edit.isPending}>
          Cancel
        </Button>
        {overlaps ? (
          <Button type="button" variant="destructive" disabled={edit.isPending} onClick={() => save(true)}>
            {edit.isPending && <Spinner />} Save anyway
          </Button>
        ) : (
          <Button type="submit" disabled={!valid || edit.isPending}>
            {edit.isPending && <Spinner />} Save
          </Button>
        )}
      </div>
    </form>
  );
}
