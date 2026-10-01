import * as React from 'react';
import { useSearchParams } from 'react-router';
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Input } from '@/components/atoms/input';
import { NativeSelect } from '@/components/atoms/native-select';
import { EmptyState } from '@/components/molecules/empty-state';
import { LoadingBlock, QueryState } from '@/components/molecules/query-state';
import { ReservationFormDialog } from '@/components/organisms/reservation-form-dialog';
import { ReservationTable } from '@/components/organisms/reservation-table';
import { PageLayout } from '@/components/templates/page-layout';
import { useProperties, useReservations } from '@/hooks/queries';
import type { ReservationFilters } from '@/lib/api';

const PAGE_SIZE = 25;
const FILTER_KEYS = ['q', 'propertyId', 'unitId', 'source', 'status', 'from', 'to', 'unassigned', 'conflicts'] as const;

export function ReservationsPage() {
  const [params, setParams] = useSearchParams();
  const properties = useProperties();
  const [search, setSearch] = React.useState(params.get('q') ?? '');
  const [creating, setCreating] = React.useState(false);

  const filters: ReservationFilters = {
    q: params.get('q') ?? undefined,
    propertyId: params.get('propertyId') ?? undefined,
    unitId: params.get('unitId') ?? undefined,
    source: params.get('source') ?? undefined,
    status: params.get('status') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    unassigned: params.get('unassigned') === 'true' || undefined,
    conflicts: params.get('conflicts') === 'true' || undefined,
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: PAGE_SIZE,
  };
  const reservations = useReservations(filters);

  const set = (key: string, value: string | null) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    if (key !== 'page') p.delete('page');
    if (key === 'propertyId') p.delete('unitId');
    setParams(p, { replace: true });
  };

  // Search as you type, without a request per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) set('q', search.trim() || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const allUnits = (properties.data ?? [])
    .filter((p) => !filters.propertyId || p.id === filters.propertyId)
    .flatMap((p) => p.units.map((u) => ({ ...u, label: (properties.data?.length ?? 0) > 1 ? `${p.name} · ${u.name}` : u.name })));
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));
  const flag = filters.unassigned ? 'unassigned' : filters.conflicts ? 'conflicts' : '';

  return (
    <PageLayout
      title="Reservations"
      description="Every reservation, from every source."
      actions={
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> New reservation
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(4,minmax(9rem,1fr))_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest or reservation ID"
            className="bg-card pl-9"
            aria-label="Search"
          />
        </div>
        {(properties.data?.length ?? 0) > 1 && (
          <NativeSelect className="bg-card rounded-md" aria-label="Property" value={filters.propertyId ?? ''} onChange={(e) => set('propertyId', e.target.value || null)}>
            <option value="">All properties</option>
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect className="bg-card rounded-md" aria-label="Unit" value={filters.unitId ?? ''} onChange={(e) => set('unitId', e.target.value || null)}>
          <option value="">All units</option>
          {allUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="bg-card rounded-md" aria-label="Status" value={filters.status ?? ''} onChange={(e) => set('status', e.target.value || null)}>
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
        <NativeSelect className="bg-card rounded-md" aria-label="Source" value={filters.source ?? ''} onChange={(e) => set('source', e.target.value || null)}>
          <option value="">All sources</option>
          <option value="BOOKING">Booking.com</option>
        </NativeSelect>
        <NativeSelect
          className="bg-card rounded-md"
          aria-label="Needs attention"
          value={flag}
          onChange={(e) => {
            const p = new URLSearchParams(params);
            p.delete('unassigned');
            p.delete('conflicts');
            p.delete('page');
            if (e.target.value) p.set(e.target.value, 'true');
            setParams(p, { replace: true });
          }}
        >
          <option value="">Everything</option>
          <option value="unassigned">Pending assignment</option>
          <option value="conflicts">Conflicts</option>
        </NativeSelect>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
          <DateFilter label="From" value={filters.from} onChange={(v) => set('from', v)} />
          <DateFilter label="To" value={filters.to} onChange={(v) => set('to', v)} />
        </div>
      </div>
      {hasFilters && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            <XIcon /> Clear filters
          </Button>
        </div>
      )}

      <QueryState query={reservations} loading={<LoadingBlock rows={6} />}>
        {(list) =>
          list.items.length === 0 ? (
            <div className="bg-card rounded-xl border">
              <EmptyState
                icon={<SearchIcon />}
                title="No reservations found."
                description={hasFilters ? 'Try other filters.' : 'Synchronize Booking to import reservations.'}
              />
            </div>
          ) : (
            <>
              <ReservationTable reservations={list.items} />
              <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={(p) => set('page', String(p))} />
            </>
          )
        }
      </QueryState>
      <ReservationFormDialog open={creating} onOpenChange={setCreating} />
    </PageLayout>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | null) => void }) {
  return (
    <Input
      type="date"
      aria-label={label}
      title={label === 'From' ? 'Stays after this date' : 'Stays before this date'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="bg-card lg:w-36"
    />
  );
}

function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="text-muted-foreground flex items-center justify-between text-sm">
      <span>
        {first}–{last} of {total}
      </span>
      {pages > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
