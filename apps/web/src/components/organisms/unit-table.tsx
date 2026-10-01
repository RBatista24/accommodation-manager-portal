import * as React from 'react';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/atoms/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { useSetUnitActive } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { Unit } from '@/lib/types';
import { UnitFormDialog } from './unit-form-dialog';

export function UnitTable({ propertyId, units, propertyActive }: { propertyId: string; units: Unit[]; propertyActive: boolean }) {
  const [editing, setEditing] = React.useState<Unit | 'new' | null>(null);
  const [toggling, setToggling] = React.useState<Unit | null>(null);
  const setActive = useSetUnitActive();

  return (
    <Card className="gap-3 pb-2">
      <CardHeader>
        <CardTitle>Units</CardTitle>
        <CardDescription>Rooms guests can book. Deactivating a unit keeps all its reservations.</CardDescription>
        {propertyActive && (
          <CardAction>
            <Button variant="outline" onClick={() => setEditing('new')}>
              <PlusIcon /> Add unit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.name}</div>
                  {u.description && <div className="text-muted-foreground max-w-xs truncate text-xs">{u.description}</div>}
                </TableCell>
                <TableCell>{u.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                    <PencilIcon /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => (setActive.reset(), setToggling(u))}>
                    {u.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {units.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                  No units yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <UnitFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        propertyId={propertyId}
        unit={editing && editing !== 'new' ? editing : undefined}
      />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.active ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.active
            ? 'It will no longer be offered for new assignments. Existing reservations stay exactly as they are.'
            : 'It will be available again for assignments and on the calendar.'
        }
        confirmLabel={toggling?.active ? 'Deactivate' : 'Activate'}
        destructive={toggling?.active}
        pending={setActive.isPending}
        error={setActive.isError ? errorMessage(setActive.error) : null}
        onConfirm={() =>
          toggling && setActive.mutate({ id: toggling.id, active: !toggling.active }, { onSuccess: () => setToggling(null) })
        }
      />
    </Card>
  );
}
