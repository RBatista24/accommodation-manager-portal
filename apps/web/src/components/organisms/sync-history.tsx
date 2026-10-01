import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { SyncStatusBadge } from '@/components/molecules/status-badges';
import { formatTimestamp } from '@/lib/dates';
import type { SyncRun } from '@/lib/types';

export function SyncHistory({ runs }: { runs: SyncRun[] }) {
  return (
    <Card className="gap-3 pb-2">
      <CardHeader>
        <CardTitle>Synchronization history</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {runs.length === 0 ? (
          <p className="text-muted-foreground px-2 pb-4 text-sm">No synchronizations yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Problems</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{formatTimestamp(run.startedAt)}</TableCell>
                  <TableCell>
                    <SyncStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.counts.created}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.counts.updated}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.counts.cancelled}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.counts.pendingAssignment}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.counts.errors}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
