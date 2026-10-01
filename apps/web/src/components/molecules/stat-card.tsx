import * as React from 'react';
import { Card } from '@/components/atoms/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-1 px-4 py-4 sm:px-5', className)}>
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </Card>
  );
}
