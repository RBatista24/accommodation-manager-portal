import * as React from 'react';
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Button } from '@/components/atoms/button';
import { Skeleton } from '@/components/atoms/skeleton';
import { errorMessage } from '@/lib/api';

/**
 * Renders the loading and error states of a query in one consistent way,
 * and the children only once data is there.
 */
export function QueryState<T>({
  query,
  loading,
  children,
}: {
  query: { data: T | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  loading?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <LoadingBlock />}</>;
  if (query.isError || query.data === undefined) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Could not load this information</AlertTitle>
        <AlertDescription>
          <p>{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => query.refetch()}>
            <RefreshCwIcon /> Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return <>{children(query.data)}</>;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
