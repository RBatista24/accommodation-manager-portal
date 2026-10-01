import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

/**
 * The reservation detail opens as a side panel on top of whatever page you are
 * on (dashboard, calendar, list). Its id lives in the URL (?reservation=...),
 * so the panel survives a refresh and can be linked to.
 */
export function useReservationParam() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const current = params.get('reservation');

  const hrefFor = useCallback(
    (id: string) => {
      const next = new URLSearchParams(location.search);
      next.set('reservation', id);
      return `${location.pathname}?${next.toString()}`;
    },
    [location.pathname, location.search],
  );

  const open = useCallback((id: string) => navigate(hrefFor(id)), [navigate, hrefFor]);

  const close = useCallback(() => {
    const next = new URLSearchParams(location.search);
    next.delete('reservation');
    const qs = next.toString();
    navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
  }, [navigate, location.pathname, location.search]);

  return { current, open, close, hrefFor };
}
