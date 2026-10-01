import * as React from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Button } from '@/components/atoms/button';
import { Skeleton } from '@/components/atoms/skeleton';
import { QueryState } from '@/components/molecules/query-state';
import { BookingCalendar } from '@/components/organisms/booking-calendar';
import { PageLayout } from '@/components/templates/page-layout';
import { useCalendar } from '@/hooks/queries';
import { useReservationParam } from '@/hooks/use-reservation-param';
import {
  addDays,
  addMonths,
  eachDay,
  formatLong,
  formatMonth,
  formatShort,
  formatStay,
  isoValid,
  startOfMonth,
  startOfWeek,
  todayLocal,
  type IsoDate,
} from '@/lib/dates';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month';
const VIEWS: { value: View; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function rangeFor(view: View, anchor: IsoDate): { from: IsoDate; to: IsoDate; title: string } {
  if (view === 'day') return { from: anchor, to: addDays(anchor, 1), title: formatLong(anchor) };
  if (view === 'week') {
    const from = startOfWeek(anchor);
    const to = addDays(from, 7);
    return { from, to, title: `${formatShort(from)} – ${formatShort(addDays(to, -1))}` };
  }
  const from = startOfMonth(anchor);
  return { from, to: addMonths(from, 1), title: formatMonth(from) };
}

function step(view: View, anchor: IsoDate, dir: 1 | -1): IsoDate {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week') return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = todayLocal();
  const view = (['day', 'week', 'month'].includes(params.get('view') ?? '') ? params.get('view') : 'week') as View;
  const anchorParam = params.get('date');
  const anchor = anchorParam && isoValid(anchorParam) ? anchorParam : today;
  const { from, to, title } = rangeFor(view, anchor);
  const days = React.useMemo(() => eachDay(from, to), [from, to]);
  const calendar = useCalendar(from, to);
  const { open } = useReservationParam();

  const update = (next: { view?: View; date?: IsoDate }) => {
    const p = new URLSearchParams(params);
    if (next.view) p.set('view', next.view);
    if (next.date) p.set('date', next.date);
    setParams(p, { replace: true });
  };

  return (
    <PageLayout title="Calendar" description="Reservations by unit. Check-in is inclusive, check-out exclusive.">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => update({ date: step(view, anchor, -1) })}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" onClick={() => update({ date: today })}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => update({ date: step(view, anchor, 1) })}>
            <ChevronRightIcon />
          </Button>
        </div>
        <div className="bg-muted inline-flex rounded-lg p-1" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={view === v.value}
              onClick={() => update({ view: v.value })}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                view === v.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <h2 className="ml-1 text-base font-semibold">{title}</h2>
      </div>

      <QueryState query={calendar} loading={<Skeleton className="h-80 rounded-xl" />}>
        {(data) => (
          <>
            <BookingCalendar data={data} days={days} today={today} />
            <Legend />
            {data.conflicts.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>
                  {data.conflicts.length} reservation conflict{data.conflicts.length === 1 ? '' : 's'} in this period
                </AlertTitle>
                <AlertDescription>
                  <ul className="grid gap-1">
                    {data.conflicts.map((c) => (
                      <li key={c.reservations.map((r) => r.id).join()}>
                        <strong>{c.unitName}</strong>:{' '}
                        {c.reservations.map((r, i) => (
                          <React.Fragment key={r.id}>
                            {i > 0 && ' and '}
                            <button type="button" className="underline underline-offset-2" onClick={() => open(r.id)}>
                              {r.guestName ?? 'Guest'} ({formatStay(r.checkIn, r.checkOut)})
                            </button>
                          </React.Fragment>
                        ))}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </QueryState>
    </PageLayout>
  );
}

function Legend() {
  const items = [
    ['Confirmed', 'bg-info border-info'],
    ['Conflict', 'bg-destructive border-destructive'],
    ['Unit pending', 'bg-warning-soft border-warning border-dashed'],
    ['Cancelled', 'bg-muted border-muted-foreground/40 border-dashed'],
  ] as const;
  return (
    <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-xs">
      {items.map(([label, cls]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn('size-3 rounded-sm border', cls)} aria-hidden="true" />
          {label}
        </span>
      ))}
      <span>Bars start at the check-in day and end at the check-out day.</span>
    </div>
  );
}
