import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronLeftIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { QueryState } from '@/components/molecules/query-state';
import { StatCard } from '@/components/molecules/stat-card';
import { DeletePropertyDialog } from '@/components/organisms/delete-property-dialog';
import { PropertyFormDialog } from '@/components/organisms/property-form-dialog';
import { UnitTable } from '@/components/organisms/unit-table';
import { PageLayout } from '@/components/templates/page-layout';
import { useProperty, useSetPropertyActive } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';

export function PropertyDetailPage() {
  const { id } = useParams();
  const property = useProperty(id);
  const [editing, setEditing] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const setActive = useSetPropertyActive();
  const [deleting, setDeleting] = React.useState(false);
  const navigate = useNavigate();

  return (
    <QueryState query={property}>
      {(p) => (
        <PageLayout
          title={
            <span className="flex items-center gap-2">
              {p.name} {!p.active && <Badge variant="secondary">Inactive</Badge>}
            </span>
          }
          description={[p.address, p.description].filter(Boolean).join(' · ') || undefined}
          actions={
            <>
              <Button asChild variant="ghost">
                <Link to="/properties">
                  <ChevronLeftIcon /> All properties
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit
              </Button>
              <Button variant="outline" onClick={() => (setActive.reset(), setToggling(true))}>
                {p.active ? 'Deactivate' : 'Activate'}
              </Button>
              {!p.active && (
                <Button variant="destructive" onClick={() => setDeleting(true)}>
                  <Trash2Icon /> Delete permanently
                </Button>
              )}
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="In house" value={p.reservationSummary.inHouse} />
            <StatCard label="Upcoming" value={p.reservationSummary.upcoming} />
            <StatCard
              label="Pending assignment"
              value={p.reservationSummary.pendingAssignment}
              hint={
                p.reservationSummary.pendingAssignment > 0 ? (
                  <Link className="underline" to={`/reservations?propertyId=${p.id}&unassigned=true`}>
                    Resolve
                  </Link>
                ) : undefined
              }
            />
            <StatCard label="All reservations" value={p.reservationSummary.total} hint={`${p.reservationSummary.cancelled} cancelled`} />
          </div>
          <UnitTable propertyId={p.id} units={p.units} propertyActive={p.active} />

          <PropertyFormDialog open={editing} onOpenChange={setEditing} property={p} />
          <DeletePropertyDialog
            open={deleting}
            onOpenChange={setDeleting}
            property={p}
            onDeleted={() => navigate('/properties', { replace: true })}
          />
          <ConfirmDialog
            open={toggling}
            onOpenChange={setToggling}
            title={p.active ? `Deactivate ${p.name}?` : `Activate ${p.name}?`}
            description={
              p.active
                ? 'It will be hidden from the dashboard and calendar. Nothing is deleted: units and reservations are kept. Once deactivated, you can also delete it permanently.'
                : 'It will appear again on the dashboard and calendar.'
            }
            confirmLabel={p.active ? 'Deactivate' : 'Activate'}
            destructive={p.active}
            pending={setActive.isPending}
            error={setActive.isError ? errorMessage(setActive.error) : null}
            onConfirm={() => setActive.mutate({ id: p.id, active: !p.active }, { onSuccess: () => setToggling(false) })}
          />
        </PageLayout>
      )}
    </QueryState>
  );
}
