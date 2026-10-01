import * as React from 'react';
import { Outlet, useLocation } from 'react-router';
import { MenuIcon } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/atoms/sheet';
import { AppNav, Brand } from '@/components/organisms/app-nav';

/**
 * Layout for every page: a fixed sidebar on desktop, a top bar with a slide-in
 * menu on tablets and phones.
 */
export function AppShell() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  React.useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-card sticky top-0 hidden h-svh flex-col gap-6 border-r px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <AppNav />
        <div className="text-muted-foreground mt-auto px-3 text-xs">Phase 1 · Booking.com</div>
      </aside>

      <header className="bg-card/95 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <Brand />
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="sr-only">Main navigation</SheetDescription>
            </SheetHeader>
            <div className="px-3">
              <AppNav onNavigate={() => setMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
