import * as React from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Button } from '@/components/atoms/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/atoms/dialog';
import { Input } from '@/components/atoms/input';
import { Spinner } from '@/components/atoms/spinner';
import { FormField } from '@/components/molecules/form-field';
import { useDeleteProperty } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { PropertyDetail } from '@/lib/types';

/**
 * Permanent deletion. When reservations would be lost, the user must type the
 * property name, so it can't happen by a stray click.
 */
export function DeletePropertyDialog({
  open,
  onOpenChange,
  property,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: PropertyDetail;
  onDeleted: () => void;
}) {
  const remove = useDeleteProperty();
  const [typed, setTyped] = React.useState('');
  const reservations = property.reservationSummary.total;
  const needsTypedName = reservations > 0;
  const confirmed = !needsTypedName || typed.trim() === property.name.trim();

  React.useEffect(() => {
    if (open) {
      setTyped('');
      remove.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {property.name} permanently?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>This will delete</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              <li>
                {property.units.length} unit{property.units.length === 1 ? '' : 's'}
              </li>
              <li>
                {reservations} reservation{reservations === 1 ? '' : 's'}, including past and cancelled ones
              </li>
              <li>its Booking room mappings and calendar links</li>
            </ul>
            <p className="mt-1">The audit log keeps a record that it existed.</p>
          </AlertDescription>
        </Alert>

        {needsTypedName && (
          <FormField id="delete-confirm" label={`Type “${property.name}” to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </FormField>
        )}
        {remove.isError && <p className="text-destructive text-sm">{errorMessage(remove.error)}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!confirmed || remove.isPending}
            onClick={() => remove.mutate(property.id, { onSuccess: onDeleted })}
          >
            {remove.isPending && <Spinner />} Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
