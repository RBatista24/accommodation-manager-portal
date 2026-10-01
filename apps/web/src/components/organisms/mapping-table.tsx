import { ArrowRightIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/atoms/card';
import { NativeSelect } from '@/components/atoms/native-select';
import { Spinner } from '@/components/atoms/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { useUpdateMapping } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { Mapping, PropertyListItem } from '@/lib/types';

/**
 * Booking room -> local unit. Changing a unit here immediately re-assigns the
 * reservations that were waiting on that room (except ones assigned by hand).
 */
export function MappingTable({ mappings, properties }: { mappings: Mapping[]; properties: PropertyListItem[] }) {
  const update = useUpdateMapping();
  const unitsOf = (propertyId: string) => properties.find((p) => p.id === propertyId)?.units.filter((u) => u.active) ?? [];

  return (
    <Card className="gap-3 pb-2">
      <CardHeader>
        <CardTitle>Room mapping</CardTitle>
        <CardDescription>
          Which Booking.com room is which unit. Reservations from a room without a unit stay “pending assignment”.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {update.isError && <p className="text-destructive px-2 pb-2 text-sm">{errorMessage(update.error)}</p>}
        {mappings.length === 0 ? (
          <p className="text-muted-foreground px-2 pb-4 text-sm">No rooms known yet. They appear here after the first synchronization.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking room</TableHead>
                <TableHead className="w-6" />
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Reservations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.externalName ?? m.externalUnitId}</div>
                    <div className="text-muted-foreground text-xs">
                      {m.propertyName} · {m.externalUnitId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ArrowRightIcon className="text-muted-foreground size-4" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <NativeSelect
                        className="w-48"
                        aria-label={`Unit for ${m.externalName ?? m.externalUnitId}`}
                        value={m.unitId ?? ''}
                        disabled={update.isPending}
                        onChange={(e) => update.mutate({ id: m.id, unitId: e.target.value || null })}
                      >
                        <option value="">No unit (pending)</option>
                        {unitsOf(m.propertyId).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                        {m.unitId && !unitsOf(m.propertyId).some((u) => u.id === m.unitId) && (
                          <option value={m.unitId}>{m.unitName} (inactive)</option>
                        )}
                      </NativeSelect>
                      {m.needsUnit && <Badge variant="warning">Needs unit</Badge>}
                      {update.isPending && update.variables?.id === m.id && <Spinner />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.reservationCount ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
