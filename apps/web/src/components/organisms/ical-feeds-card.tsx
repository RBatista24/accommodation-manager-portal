import * as React from 'react';
import { CircleAlertIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/atoms/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/atoms/dialog';
import { Input } from '@/components/atoms/input';
import { NativeSelect } from '@/components/atoms/native-select';
import { Spinner } from '@/components/atoms/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { FormField } from '@/components/molecules/form-field';
import { useCreateFeed, useDeleteFeed, useUpdateFeed } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { formatTimestamp } from '@/lib/dates';
import type { IcalFeed, PropertyListItem } from '@/lib/types';

/** Booking.com calendar links (one per room). Only shown in iCal mode. */
export function IcalFeedsCard({ feeds, properties }: { feeds: IcalFeed[]; properties: PropertyListItem[] }) {
  const [adding, setAdding] = React.useState(false);
  const update = useUpdateFeed('booking');
  const remove = useDeleteFeed('booking');
  const [deleting, setDeleting] = React.useState<IcalFeed | null>(null);

  return (
    <Card className="gap-3 pb-2">
      <CardHeader>
        <CardTitle>Calendar links</CardTitle>
        <CardDescription>
          One link per room, from the Booking.com extranet (calendar export). Links are private: only a short preview is shown.
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon /> Add link
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {feeds.length === 0 ? (
          <p className="text-muted-foreground px-2 pb-4 text-sm">No calendar links yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Last read</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="font-medium">{f.name}</div>
                    <div className="text-muted-foreground text-xs">{f.urlPreview}</div>
                  </TableCell>
                  <TableCell>{f.unitName ?? <Badge variant="warning">Needs unit</Badge>}</TableCell>
                  <TableCell>
                    {f.lastError ? (
                      <span className="text-destructive inline-flex items-center gap-1 text-sm">
                        <CircleAlertIcon className="size-4" /> Could not be read
                      </span>
                    ) : (
                      formatTimestamp(f.lastFetchedAt)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {f.active ? (
                      <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: f.id, active: false })}>
                        Pause
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: f.id, active: true })}>
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => (remove.reset(), setDeleting(f))}
                    >
                      <Trash2Icon /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <AddFeedDialog open={adding} onOpenChange={setAdding} properties={properties} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the calendar link “${deleting?.name ?? ''}”?`}
        description={
          deleting?.reservationCount
            ? `Its room mapping and the ${deleting.reservationCount} reservation${deleting.reservationCount === 1 ? '' : 's'} imported through it will be deleted too. This cannot be undone.`
            : 'Its room mapping will be deleted too. No reservations were imported through it. This cannot be undone.'
        }
        confirmLabel="Delete link"
        destructive
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Card>
  );
}

function AddFeedDialog({
  open,
  onOpenChange,
  properties,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: PropertyListItem[];
}) {
  const create = useCreateFeed('booking');
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [propertyId, setPropertyId] = React.useState(properties[0]?.id ?? '');
  const [unitId, setUnitId] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const units = properties.find((p) => p.id === propertyId)?.units.filter((u) => u.active) ?? [];

  React.useEffect(() => {
    if (open) {
      setName('');
      setUrl('');
      setUnitId('');
      setTouched(false);
      create.reset();
      if (!propertyId && properties[0]) setPropertyId(properties[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errors = {
    name: !name.trim() ? 'Give the link a name, e.g. the room name' : null,
    url: !/^https:\/\//.test(url.trim()) ? 'Paste the calendar link from Booking.com (it starts with https://)' : null,
    propertyId: !propertyId ? 'Choose a property' : null,
  };
  const valid = !errors.name && !errors.url && !errors.propertyId;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    create.mutate(
      { name: name.trim(), url: url.trim(), propertyId, unitId: unitId || null },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add a Booking.com calendar link</DialogTitle>
            <DialogDescription>In the extranet, open the calendar export for one room and copy its link.</DialogDescription>
          </DialogHeader>
          <FormField id="feed-name" label="Name" error={touched ? errors.name : null}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quarto Cegonha" />
          </FormField>
          <FormField id="feed-url" label="Calendar link" error={touched ? errors.url : null}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/ical/….ics" autoComplete="off" />
          </FormField>
          {properties.length > 1 && (
            <FormField id="feed-property" label="Property" error={touched ? errors.propertyId : null}>
              <NativeSelect value={propertyId} onChange={(e) => (setPropertyId(e.target.value), setUnitId(''))}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <FormField id="feed-unit" label="Unit" hint="Reservations from this link go to this unit.">
            <NativeSelect value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Decide later</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {create.isError && <p className="text-destructive text-sm">{errorMessage(create.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />} Add link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
