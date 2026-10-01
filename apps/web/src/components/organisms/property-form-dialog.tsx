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
import { useSaveProperty } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { Property } from '@/lib/types';

export function PropertyFormDialog({
  open,
  onOpenChange,
  property,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: Property;
  onSaved?: (p: Property) => void;
}) {
  const save = useSaveProperty();
  const [name, setName] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(property?.name ?? '');
      setAddress(property?.address ?? '');
      setDescription(property?.description ?? '');
      setTouched(false);
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property]);

  const nameError = !name.trim() ? 'Enter a name' : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    save.mutate(
      { id: property?.id, name: name.trim(), address: address.trim(), description: description.trim() },
      {
        onSuccess: (p) => {
          onOpenChange(false);
          onSaved?.(p);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{property ? 'Edit property' : 'New property'}</DialogTitle>
            <DialogDescription>{property ? 'Change the property details.' : 'Add a property. You can add its units next.'}</DialogDescription>
          </DialogHeader>
          <FormField id="property-name" label="Name" error={touched ? nameError : null}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Carnot House" />
          </FormField>
          <FormField id="property-address" label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormField id="property-description" label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </FormField>
          {save.isError && <p className="text-destructive text-sm">{errorMessage(save.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />} {property ? 'Save changes' : 'Create property'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
