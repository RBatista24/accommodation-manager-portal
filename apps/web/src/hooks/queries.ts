import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type NewReservation, type ReservationEdit, type ReservationFilters } from '@/lib/api';

/**
 * All server state goes through these hooks. After any change, the affected
 * queries are refetched so every screen stays consistent.
 */
export const keys = {
  dashboard: ['dashboard'] as const,
  calendar: (from: string, to: string, propertyId?: string) => ['calendar', from, to, propertyId ?? null] as const,
  reservations: (filters: ReservationFilters) => ['reservations', filters] as const,
  reservation: (id: string) => ['reservation', id] as const,
  properties: (includeInactive: boolean) => ['properties', includeInactive] as const,
  property: (id: string) => ['property', id] as const,
  integration: (source: string) => ['integration', source] as const,
  syncs: (source: string) => ['syncs', source] as const,
  mappings: (source: string) => ['mappings', source] as const,
  feeds: (source: string) => ['feeds', source] as const,
};

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: api.dashboard });

export const useCalendar = (from: string, to: string, propertyId?: string) =>
  useQuery({ queryKey: keys.calendar(from, to, propertyId), queryFn: () => api.calendar(from, to, propertyId) });

export const useReservations = (filters: ReservationFilters) =>
  useQuery({ queryKey: keys.reservations(filters), queryFn: () => api.reservations(filters) });

export const useReservation = (id: string | undefined) =>
  useQuery({ queryKey: keys.reservation(id ?? ''), queryFn: () => api.reservation(id!), enabled: !!id });

export const useProperties = (includeInactive = false) =>
  useQuery({ queryKey: keys.properties(includeInactive), queryFn: () => api.properties(includeInactive) });

export const useProperty = (id: string | undefined) =>
  useQuery({ queryKey: keys.property(id ?? ''), queryFn: () => api.property(id!), enabled: !!id });

export const useIntegration = (source: string) =>
  useQuery({ queryKey: keys.integration(source), queryFn: () => api.integration(source) });

export const useSyncs = (source: string) =>
  useQuery({ queryKey: keys.syncs(source), queryFn: () => api.syncs(source.toUpperCase(), 10) });

export const useMappings = (source: string) =>
  useQuery({ queryKey: keys.mappings(source), queryFn: () => api.mappings(source.toUpperCase()) });

export const useFeeds = (source: string, enabled = true) =>
  useQuery({ queryKey: keys.feeds(source), queryFn: () => api.feeds(source), enabled });

/** Reservations, calendar, dashboard, properties... almost everything depends on the same data. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useSync(source: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: () => api.sync(source), onSettled: invalidate });
}

export function useAssignUnit(reservationId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (unitId: string) => api.assignUnit(reservationId, unitId), onSuccess: invalidate });
}

export function useCreateReservation() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (body: NewReservation) => api.createReservation(body), onSuccess: invalidate });
}

export function useCancelReservation(reservationId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: () => api.cancelReservation(reservationId), onSuccess: invalidate });
}

export function useEditReservation(reservationId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (body: ReservationEdit) => api.editReservation(reservationId, body), onSuccess: invalidate });
}

export function useSaveProperty() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { id?: string; name: string; description?: string; address?: string }) =>
      v.id ? api.updateProperty(v.id, v) : api.createProperty(v),
    onSuccess: invalidate,
  });
}

export function useSetPropertyActive() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (v: { id: string; active: boolean }) => api.setPropertyActive(v.id, v.active), onSuccess: invalidate });
}

/**
 * Refreshes everything except the deleted property's own detail query, so the
 * page we are leaving does not try to reload a property that no longer exists.
 */
export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProperty(id),
    onSuccess: () => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'property' });
    },
  });
}

export function useSaveUnit(propertyId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { id?: string; name: string; description?: string }) =>
      v.id ? api.updateUnit(v.id, v) : api.createUnit(propertyId, v),
    onSuccess: invalidate,
  });
}

export function useSetUnitActive() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (v: { id: string; active: boolean }) => api.setUnitActive(v.id, v.active), onSuccess: invalidate });
}

export function useUpdateMapping() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { id: string; unitId?: string | null; active?: boolean }) => api.updateMapping(v.id, v),
    onSuccess: invalidate,
  });
}

export function useCreateFeed(source: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { name: string; url: string; propertyId: string; unitId?: string | null }) => api.createFeed(source, v),
    onSuccess: invalidate,
  });
}

export function useDeleteFeed(source: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.deleteFeed(source, id), onSuccess: invalidate });
}

export function useUpdateFeed(source: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { id: string; active?: boolean; unitId?: string | null }) => api.updateFeed(source, v.id, v),
    onSuccess: invalidate,
  });
}
