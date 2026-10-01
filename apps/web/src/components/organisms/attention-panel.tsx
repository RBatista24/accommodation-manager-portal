import { Link } from 'react-router';
import { CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Button } from '@/components/atoms/button';
import type { AttentionItem } from '@/lib/types';

const TARGETS: Record<string, { to: string; label: string }> = {
  PENDING_ASSIGNMENT: { to: '/reservations?unassigned=true', label: 'Resolve' },
  CONFLICT: { to: '/reservations?conflicts=true', label: 'Review' },
  SYNC_FAILED: { to: '/integrations', label: 'Open Booking' },
  SYNC_PARTIAL: { to: '/integrations', label: 'See details' },
};

/** "Attention required": only problems Phase 1 can actually detect. */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Alert variant="success">
        <CircleCheckIcon />
        <AlertTitle>Nothing needs your attention</AlertTitle>
        <AlertDescription>All reservations have a unit and there are no conflicts.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-2">
      {items.map((item) => {
        const target = TARGETS[item.kind];
        return (
          <Alert key={item.kind} variant={item.severity === 'error' ? 'destructive' : 'warning'} className="items-center">
            <TriangleAlertIcon />
            <div className="col-start-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{item.message}</span>
              {target && (
                <Button asChild size="sm" variant="outline" className="bg-background text-foreground">
                  <Link to={target.to}>{target.label}</Link>
                </Button>
              )}
            </div>
          </Alert>
        );
      })}
    </div>
  );
}
