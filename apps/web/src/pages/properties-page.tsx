import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2Icon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { EmptyState } from '@/components/molecules/empty-state';
import { QueryState } from '@/components/molecules/query-state';
import { PropertyFormDialog } from '@/components/organisms/property-form-dialog';
import { PageLayout } from '@/components/templates/page-layout';
import { useProperties } from '@/hooks/queries';

export function PropertiesPage() {
  const [showInactive, setShowInactive] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const properties = useProperties(showInactive);
  const navigate = useNavigate();

  return (
    <PageLayout
      title="Properties"
      description="Properties and their units."
      actions={
        <>
          <Button variant="ghost" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? 'Hide inactive' : 'Show inactive'}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> New property
          </Button>
        </>
      }
    >
      <QueryState query={properties}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState icon={<Building2Icon />} title="No properties yet" description="Create your first property to start." />
            </Card>
          ) : (
            <div className="grid gap-3">
              {list.map((p) => (
                <Link
                  key={p.id}
                  to={`/properties/${p.id}`}
                  className="bg-card hover:bg-muted/40 flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors sm:p-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      {!p.active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    {p.address && <div className="text-muted-foreground truncate text-sm">{p.address}</div>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.units.filter((u) => u.active).map((u) => (
                        <Badge key={u.id} variant="outline">
                          {u.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-sm">
                    {p.unitCount} unit{p.unitCount === 1 ? '' : 's'}
                    <ChevronRightIcon className="size-4" />
                  </div>
                </Link>
              ))}
            </div>
          )
        }
      </QueryState>
      <PropertyFormDialog open={creating} onOpenChange={setCreating} onSaved={(p) => navigate(`/properties/${p.id}`)} />
    </PageLayout>
  );
}
