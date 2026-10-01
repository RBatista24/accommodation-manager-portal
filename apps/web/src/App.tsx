import { Navigate, Route, Routes, useParams } from 'react-router';
import { ReservationDetailSheet } from '@/components/organisms/reservation-detail-sheet';
import { AppShell } from '@/components/templates/app-shell';
import { CalendarPage } from '@/pages/calendar-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { IntegrationsPage } from '@/pages/integrations-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { PropertiesPage } from '@/pages/properties-page';
import { PropertyDetailPage } from '@/pages/property-detail-page';
import { ReservationsPage } from '@/pages/reservations-page';

/** /reservations/:id is a shareable link that opens the list with that reservation's panel. */
function ReservationRedirect() {
  const { id } = useParams();
  return <Navigate to={`/reservations?reservation=${id}`} replace />;
}

export function App() {
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="reservations/:id" element={<ReservationRedirect />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="properties/:id" element={<PropertyDetailPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <ReservationDetailSheet />
    </>
  );
}
