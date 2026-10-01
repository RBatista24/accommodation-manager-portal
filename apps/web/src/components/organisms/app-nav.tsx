import { NavLink } from 'react-router';
import { Building2Icon, CalendarDaysIcon, LayoutDashboardIcon, ListIcon, PlugIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDaysIcon, end: false },
  { to: '/reservations', label: 'Reservations', icon: ListIcon, end: false },
  { to: '/properties', label: 'Properties', icon: Building2Icon, end: false },
  { to: '/integrations', label: 'Integrations', icon: PlugIcon, end: false },
] as const;

/** Main navigation. Settings is intentionally absent: Phase 1 needs none. */
export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="grid gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-semibold">AM</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Accommodation</div>
        <div className="text-muted-foreground text-xs">Manager</div>
      </div>
    </div>
  );
}
