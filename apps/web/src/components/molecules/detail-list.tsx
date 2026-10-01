import * as React from 'react';
import { cn } from '@/lib/utils';

/** Label/value pairs, e.g. on the reservation detail. */
export function DetailList({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2.5 text-sm', className)}>
      {items.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? <span className="text-muted-foreground">—</span>}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
