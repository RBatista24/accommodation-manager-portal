import * as React from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { ReservationStatusBadge } from '@/components/molecules/status-badges';
import { useReservationParam } from '@/hooks/use-reservation-param';
import { daysBetween, formatShort, formatStay, formatWeekday, nightsLabel, type IsoDate } from '@/lib/dates';
import type { CalendarData, Reservation } from '@/lib/types';
import { cn } from '@/lib/utils';

const LANE_HEIGHT = 34;
const ROW_PADDING = 8;
const UNASSIGNED = '__unassigned__';

interface Bar {
  reservation: Reservation;
  /** Positions in "cells": check-in at the middle of its day, check-out at the middle of its day. */
  start: number;
  end: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  lane: number;
}

/**
 * Reservations drawn per unit on a day grid. A bar starts in the middle of the
 * check-in day and ends in the middle of the check-out day, so back-to-back
 * stays (02→05, 05→07) meet in the same cell without overlapping.
 */
export function BookingCalendar({ data, days, today }: { data: CalendarData; days: IsoDate[]; today: IsoDate }) {
  const { open } = useReservationParam();
  const n = days.length;
  const from = days[0]!;

  const rows = React.useMemo(() => {
    const byUnit = new Map<string, Reservation[]>();
    for (const r of data.reservations) {
      const key = r.unitId ?? UNASSIGNED;
      byUnit.set(key, [...(byUnit.get(key) ?? []), r]);
    }
    const result = data.units.map((u) => ({ id: u.id, name: u.name, inactive: !u.active, bars: layout(byUnit.get(u.id) ?? [], from, n) }));
    const unassigned = byUnit.get(UNASSIGNED);
    if (unassigned?.length) result.push({ id: UNASSIGNED, name: 'Unassigned', inactive: false, bars: layout(unassigned, from, n) });
    return result;
  }, [data, from, n]);

  const cellMin = n <= 1 ? 16 : n <= 7 ? 6 : n <= 14 ? 3.5 : 1.9;
  const scroller = React.useRef<HTMLDivElement>(null);

  // Month view can be wider than the screen: bring today into view.
  React.useEffect(() => {
    const el = scroller.current;
    const idx = days.indexOf(today);
    if (!el || idx < 0 || el.scrollWidth <= el.clientWidth) return;
    const cell = (el.scrollWidth - 160) / n;
    el.scrollLeft = Math.max(0, 160 + idx * cell - el.clientWidth / 2);
  }, [days, today, n]);
  const template = `repeat(${n}, minmax(${cellMin}rem, 1fr))`;

  return (
    <>
      {/* Timeline: tablets and desktops */}
      <div ref={scroller} className="hidden overflow-x-auto rounded-xl border md:block">
        <div className="bg-card" style={{ minWidth: `calc(10rem + ${n * cellMin}rem)` }}>
          <div className="bg-muted/40 sticky top-0 z-10 flex border-b">
            <div className="bg-card sticky left-0 z-10 w-40 shrink-0 border-r px-3 py-2 text-xs font-medium">Unit</div>
            <div className="grid flex-1" style={{ gridTemplateColumns: template }}>
              {days.map((d) => (
                <div
                  key={d}
                  className={cn(
                    'border-r px-1 py-1.5 text-center text-xs last:border-r-0',
                    d === today ? 'bg-info-soft text-info font-semibold' : 'text-muted-foreground',
                  )}
                >
                  <div>{n > 14 ? formatWeekday(d).slice(0, 1) : formatWeekday(d)}</div>
                  <div className="text-foreground font-medium">{d.slice(8)}</div>
                </div>
              ))}
            </div>
          </div>

          {rows.map((row) => {
            const lanes = Math.max(1, ...row.bars.map((b) => b.lane + 1));
            return (
              <div key={row.id} className="flex border-b last:border-b-0">
                <div
                  className={cn(
                    'bg-card sticky left-0 z-10 flex w-40 shrink-0 items-center gap-1.5 border-r px-3 text-sm font-medium',
                    row.id === UNASSIGNED && 'text-warning',
                  )}
                >
                  {row.id === UNASSIGNED && <TriangleAlertIcon className="size-4 shrink-0" />}
                  <span className="truncate">{row.name}</span>
                  {row.inactive && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <div className="relative flex-1" style={{ height: lanes * LANE_HEIGHT + ROW_PADDING * 2 }}>
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: template }}>
                    {days.map((d) => (
                      <div key={d} className={cn('border-r last:border-r-0', d === today && 'bg-info-soft/60')} />
                    ))}
                  </div>
                  {row.bars.map((bar) => (
                    <CalendarBar key={bar.reservation.id} bar={bar} n={n} onOpen={open} />
                  ))}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-muted-foreground p-6 text-sm">No units to show.</p>}
        </div>
      </div>

      {/* Agenda: phones */}
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="bg-card rounded-xl border p-4">
            <div className={cn('mb-2 flex items-center gap-2 font-medium', row.id === UNASSIGNED && 'text-warning')}>
              {row.id === UNASSIGNED && <TriangleAlertIcon className="size-4" />}
              {row.name}
            </div>
            {row.bars.length === 0 ? (
              <p className="text-muted-foreground text-sm">Free for the whole period</p>
            ) : (
              <ul className="divide-y">
                {row.bars.map(({ reservation: r }) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => open(r.id)}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                    >
                      <div className="min-w-0">
                        <div className={cn('truncate text-sm font-medium', r.status === 'CANCELLED' && 'text-muted-foreground line-through')}>
                          {r.guestName ?? 'Guest name unavailable'}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatStay(r.checkIn, r.checkOut)} · {nightsLabel(r.nights)}
                        </div>
                      </div>
                      <ReservationStatusBadge reservation={r} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarBar({ bar, n, onOpen }: { bar: Bar; n: number; onOpen: (id: string) => void }) {
  const r = bar.reservation;
  const kind = r.status === 'CANCELLED' ? 'cancelled' : r.pendingAssignment ? 'unassigned' : r.hasConflict ? 'conflict' : 'ok';
  const title = [
    r.guestName ?? 'Guest name unavailable',
    `${formatShort(r.checkIn)} → ${formatShort(r.checkOut)} (${nightsLabel(r.nights)})`,
    kind === 'cancelled' ? 'Cancelled' : kind === 'unassigned' ? 'Unit pending assignment' : kind === 'conflict' ? 'Conflict' : 'Confirmed',
  ].join('\n');

  return (
    <button
      type="button"
      title={title}
      onClick={() => onOpen(r.id)}
      className={cn(
        'absolute flex items-center gap-1 overflow-hidden rounded-md border px-2 text-left text-xs font-medium whitespace-nowrap transition-[filter] hover:brightness-95 focus-visible:ring-[3px] focus-visible:outline-none',
        kind === 'ok' && 'bg-info border-info text-white',
        kind === 'conflict' && 'bg-destructive border-destructive ring-destructive/25 text-white ring-2',
        kind === 'unassigned' && 'bg-warning-soft border-warning text-warning border-dashed',
        kind === 'cancelled' && 'bg-muted text-muted-foreground border-muted-foreground/40 border-dashed line-through',
        bar.clippedStart && 'rounded-l-none',
        bar.clippedEnd && 'rounded-r-none',
      )}
      style={{
        left: `calc(${(bar.start / n) * 100}% + 2px)`,
        width: `calc(${((bar.end - bar.start) / n) * 100}% - 4px)`,
        top: ROW_PADDING + bar.lane * LANE_HEIGHT,
        height: LANE_HEIGHT - 6,
      }}
    >
      {kind === 'conflict' && <TriangleAlertIcon className="size-3.5 shrink-0" />}
      <span className="truncate">{r.guestName ?? 'Guest'}</span>
    </button>
  );
}

/** Positions bars and stacks overlapping ones (conflicts, cancellations) on separate lanes. */
function layout(reservations: Reservation[], from: IsoDate, n: number): Bar[] {
  const bars = reservations
    .map((reservation) => {
      const inIdx = daysBetween(from, reservation.checkIn);
      const outIdx = daysBetween(from, reservation.checkOut);
      const clippedStart = inIdx < 0;
      const clippedEnd = outIdx >= n;
      return {
        reservation,
        start: clippedStart ? 0 : inIdx + 0.5,
        end: clippedEnd ? n : outIdx + 0.5,
        clippedStart,
        clippedEnd,
        lane: 0,
      };
    })
    .filter((b) => b.end > b.start)
    // Confirmed first, so they take the top lane; cancelled ones go below.
    .sort((a, b) =>
      a.reservation.status !== b.reservation.status ? (a.reservation.status === 'CONFIRMED' ? -1 : 1) : a.start - b.start,
    );

  const laneEnds: number[] = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end <= bar.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = bar.end;
    bar.lane = lane;
  }
  return bars;
}
