import * as React from 'react';
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
import { Textarea } from '@/components/atoms/textarea';
import { FormField } from '@/components/molecules/form-field';
import { useSaveUnit } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { Unit } from '@/lib/types';

export function UnitFormDialog({
  open,
  onOpenChange,
  propertyId,
  unit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  unit?: Unit;
}) {
  const save = useSaveUnit(propertyId);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(unit?.name ?? '');
      setDescription(unit?.description ?? '');
      setTouched(false);
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

  const nameError = !name.trim() ? 'Enter a name' : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    save.mutate({ id: unit?.id, name: name.trim(), description: description.trim() }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{unit ? 'Edit unit' : 'New unit'}</DialogTitle>
            <DialogDescription>A unit is a room or apartment that guests book.</DialogDescription>
          </DialogHeader>
          <FormField id="unit-name" label="Name" error={touched ? nameError : null}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quarto Cegonha" />
          </FormField>
          <FormField id="unit-description" label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </FormField>
          {save.isError && <p className="text-destructive text-sm">{errorMessage(save.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />} {unit ? 'Save changes' : 'Add unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
