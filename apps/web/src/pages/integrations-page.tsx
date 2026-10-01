import { Skeleton } from '@/components/atoms/skeleton';
import { QueryState } from '@/components/molecules/query-state';
import { CalendarExportCard } from '@/components/organisms/calendar-export-card';
import { IcalFeedsCard } from '@/components/organisms/ical-feeds-card';
import { MappingTable } from '@/components/organisms/mapping-table';
import { SyncHistory } from '@/components/organisms/sync-history';
import { SyncPanel } from '@/components/organisms/sync-panel';
import { PageLayout } from '@/components/templates/page-layout';
import { useCalendarExports, useFeeds, useIntegration, useMappings, useProperties, useSyncs } from '@/hooks/queries';

export function IntegrationsPage() {
  const booking = useIntegration('booking');
  const mappings = useMappings('booking');
  const properties = useProperties();
  const syncs = useSyncs('booking');
  const icalMode = booking.data?.mode === 'ical';
  const feeds = useFeeds('booking', icalMode);
  const exports = useCalendarExports();

  return (
    <PageLayout title="Integrations" description="Where reservations come from.">
      <QueryState query={booking} loading={<Skeleton className="h-56 rounded-xl" />}>
        {(integration) => <SyncPanel integration={integration} />}
      </QueryState>

      {icalMode && properties.data && (
        <QueryState query={feeds} loading={<Skeleton className="h-40 rounded-xl" />}>
          {(list) => <IcalFeedsCard feeds={list} properties={properties.data!} />}
        </QueryState>
      )}

      <QueryState query={mappings} loading={<Skeleton className="h-64 rounded-xl" />}>
        {(list) => <MappingTable mappings={list} properties={properties.data ?? []} />}
      </QueryState>

      <QueryState query={exports} loading={<Skeleton className="h-48 rounded-xl" />}>
        {(list) => <CalendarExportCard exports={list} />}
      </QueryState>

      <QueryState query={syncs} loading={<Skeleton className="h-48 rounded-xl" />}>
        {(runs) => <SyncHistory runs={runs} />}
      </QueryState>
    </PageLayout>
  );
}
