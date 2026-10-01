import { CircleAlertIcon, CircleCheckIcon, RefreshCwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/atoms/card';
import { Spinner } from '@/components/atoms/spinner';
import { SyncStatusBadge } from '@/components/molecules/status-badges';
import { useSync } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { formatTimestamp } from '@/lib/dates';
import type { IntegrationStatus, SyncRun } from '@/lib/types';

/** Connection state, the last result and the "Sync Booking" action. */
export function SyncPanel({ integration, compact = false }: { integration: IntegrationStatus; compact?: boolean }) {
  const sync = useSync('booking');
  const last = integration.lastSync;
  const running = sync.isPending || integration.syncing;

  return (
    <Card className={compact ? 'gap-4 py-5' : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span
            className={`size-2.5 rounded-full ${integration.configured ? 'bg-success' : 'bg-muted-foreground'}`}
            aria-hidden="true"
          />
          Booking.com
          {integration.mode === 'mock' && <Badge variant="info">Demo data</Badge>}
          {integration.mode === 'ical' && <Badge variant="outline">Calendar links (iCal)</Badge>}
        </CardTitle>
        <CardDescription>{integration.configured ? integration.summary : 'Not configured yet. Add a calendar link below.'}</CardDescription>
        <CardAction>
          <Button onClick={() => sync.mutate()} disabled={running || !integration.configured}>
            {running ? <Spinner /> : <RefreshCwIcon />}
            {running ? 'Synchronizing…' : 'Sync Booking'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {running && <p className="text-muted-foreground text-sm">Synchronizing Booking… this usually takes a few seconds.</p>}

        {!running && sync.isSuccess && sync.data.status === 'SUCCESS' && (
          <Alert variant="success">
            <CircleCheckIcon />
            <AlertTitle>Booking synchronized successfully</AlertTitle>
          </Alert>
        )}
        {!running && sync.isError && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Unable to synchronize Booking</AlertTitle>
            <AlertDescription>
              <p>{errorMessage(sync.error)}</p>
              <Button variant="outline" size="sm" className="mt-1" onClick={() => sync.mutate()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {last ? (
          <LastSync run={last} compact={compact} onRetry={() => sync.mutate()} />
        ) : (
          <p className="text-muted-foreground text-sm">No synchronization yet. Press “Sync Booking” to import reservations.</p>
        )}
      </CardContent>
    </Card>
  );
}

function LastSync({ run, compact, onRetry }: { run: SyncRun; compact: boolean; onRetry: () => void }) {
  const stats: [string, number][] = [
    ['New', run.counts.created],
    ['Updated', run.counts.updated],
    ['Cancelled', run.counts.cancelled],
    ['Pending assignment', run.counts.pendingAssignment],
  ];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Last synchronization</span>
        <span className="font-medium">{formatTimestamp(run.finishedAt ?? run.startedAt)}</span>
        <SyncStatusBadge status={run.status} />
      </div>
      {run.status !== 'FAILED' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-muted/50 rounded-lg px-3 py-2">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {run.status === 'FAILED' && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Synchronization failed</AlertTitle>
          <AlertDescription>
            <p>{run.errorMessage ?? 'The Booking synchronization could not be completed.'}</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!compact && run.status === 'PARTIAL' && run.errors.length > 0 && (
        <Alert variant="warning">
          <CircleAlertIcon />
          <AlertTitle>{run.errorMessage}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {run.errors.slice(0, 8).map((e, i) => (
                <li key={i}>
                  {e.scope && <strong>{e.scope}: </strong>}
                  {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
