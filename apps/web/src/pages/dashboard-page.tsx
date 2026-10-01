import { Link } from 'react-router';
import { BedDoubleIcon, CalendarDaysIcon, LogInIcon, LogOutIcon, UsersIcon } from 'lucide-react';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/atoms/card';
import { Skeleton } from '@/components/atoms/skeleton';
import { QueryState } from '@/components/molecules/query-state';
import { ReservationLine } from '@/components/molecules/reservation-line';
import { StatCard } from '@/components/molecules/stat-card';
import { AttentionPanel } from '@/components/organisms/attention-panel';
import { SyncPanel } from '@/components/organisms/sync-panel';
import { PageLayout } from '@/components/templates/page-layout';
import { useDashboard, useIntegration } from '@/hooks/queries';
import { useReservationParam } from '@/hooks/use-reservation-param';
import { formatLong, formatShort } from '@/lib/dates';
import type { Dashboard } from '@/lib/types';

export function DashboardPage() {
  const dashboard = useDashboard();
  const booking = useIntegration('booking');

  return (
    <PageLayout
      title="Dashboard"
      description={dashboard.data ? formatLong(dashboard.data.date) : 'Today at a glance'}
      actions={
        <Button asChild variant="outline">
          <Link to="/calendar">
            <CalendarDaysIcon /> Open calendar
          </Link>
        </Button>
      }
    >
      <QueryState query={dashboard} loading={<DashboardSkeleton />}>
        {(d) => (
          <>
            <AttentionPanel items={d.attention} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              <StatCard label="Check-ins today" value={d.today.checkIns.length} icon={<LogInIcon />} />
              <StatCard label="Check-outs today" value={d.today.checkOuts.length} icon={<LogOutIcon />} />
              <StatCard
                label="Current guests"
                value={d.today.inHouse.reduce((sum, r) => sum + (r.numberOfGuests ?? 0), 0) || d.today.inHouse.length}
                hint={`${d.today.inHouse.length} reservation${d.today.inHouse.length === 1 ? '' : 's'} in house`}
                icon={<UsersIcon />}
              />
              <StatCard
                label="Occupied units"
                value={
                  <>
                    {d.occupancy.occupiedUnits}
                    <span className="text-muted-foreground text-lg font-normal"> / {d.occupancy.totalUnits}</span>
                  </>
                }
                hint={`${d.occupancy.availableUnits} available tonight${d.occupancy.blockedUnits ? ` · ${d.occupancy.blockedUnits} blocked` : ''}`}
                icon={<BedDoubleIcon />}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <TodayCard dashboard={d} />
              <UpcomingCard dashboard={d} />
              {booking.data ? <SyncPanel integration={booking.data} compact /> : <Skeleton className="h-64 rounded-xl" />}
            </div>
            <UnitsNow dashboard={d} />
          </>
        )}
      </QueryState>
    </PageLayout>
  );
}

function TodayCard({ dashboard: d }: { dashboard: Dashboard }) {
  const empty = d.today.checkIns.length === 0 && d.today.checkOuts.length === 0;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Today</CardTitle>
        <CardDescription>Arrivals and departures</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {empty && <p className="text-muted-foreground text-sm">No arrivals or departures today.</p>}
        {d.today.checkIns.length > 0 && (
          <section>
            <h3 className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <LogInIcon className="size-3.5" /> Check-in
            </h3>
            {d.today.checkIns.map((r) => (
              <ReservationLine key={r.id} reservation={r} />
            ))}
          </section>
        )}
        {d.today.checkOuts.length > 0 && (
          <section>
            <h3 className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <LogOutIcon className="size-3.5" /> Check-out
            </h3>
            {d.today.checkOuts.map((r) => (
              <ReservationLine key={r.id} reservation={r} />
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ dashboard: d }: { dashboard: Dashboard }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Upcoming</CardTitle>
        <CardDescription>Arrivals in the next 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        {d.upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">No upcoming arrivals.</p>
        ) : (
          d.upcoming.slice(0, 8).map((r) => <ReservationLine key={r.id} reservation={r} meta={formatShort(r.checkIn)} />)
        )}
        {d.upcoming.length > 8 && (
          <Button asChild variant="link" className="mt-1 px-0">
            <Link to="/reservations">See all reservations</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function UnitsNow({ dashboard: d }: { dashboard: Dashboard }) {
  const { hrefFor } = useReservationParam();
  const guestOf = (id: string | null) => d.today.inHouse.find((r) => r.id === id);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Units right now</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {d.occupancy.units.map((u) => {
          const r = guestOf(u.currentReservationId);
          const body = (
            <>
              <div className="truncate text-sm font-medium">{u.name}</div>
              {r ? (
                <>
                  <Badge variant="info" className="mt-2">
                    Occupied
                  </Badge>
                  <div className="text-muted-foreground mt-1 truncate text-xs">
                    {r.guestName} · until {formatShort(r.checkOut)}
                  </div>
                </>
              ) : u.blocked ? (
                <Badge variant="outline" className="mt-2">
                  Blocked
                </Badge>
              ) : (
                <Badge variant="secondary" className="mt-2">
                  Available
                </Badge>
              )}
            </>
          );
          return r ? (
            <Link key={u.id} to={hrefFor(r.id)} className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
              {body}
            </Link>
          ) : (
            <div key={u.id} className="rounded-lg border p-3">
              {body}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-14 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
