import type {
  CalendarData,
  CalendarExport,
  Dashboard,
  IcalFeed,
  IntegrationStatus,
  Mapping,
  Property,
  PropertyDetail,
  PropertyListItem,
  ReservationDetail,
  ReservationKind,
  ReservationList,
  SyncRun,
  Unit,
} from './types';

/** An error whose message is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Structured extra data from the API, e.g. the overlapping stays of a 409. */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the API is running.');
  }

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
    let details: unknown;
    try {
      const body = (await response.json()) as { message?: string | string[]; details?: unknown };
      if (body?.message) message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
      details = body?.details;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(response.status, message, details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const get = <T>(path: string, query?: Query) => request<T>(withQuery(path, query));
const send = <T>(method: 'POST' | 'PATCH', path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface ReservationFilters extends Query {
  propertyId?: string;
  unitId?: string;
  source?: string;
  status?: string;
  kind?: string;
  from?: string;
  to?: string;
  q?: string;
  unassigned?: boolean;
  conflicts?: boolean;
  page?: number;
  pageSize?: number;
}

/** Details a source does not provide. Empty text clears a field. */
export interface ReservationEdit {
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  numberOfGuests?: number | null;
  notes?: string | null;
  billingName?: string | null;
  billingNif?: string | null;
  billingAddress?: string | null;
  /** Only for reservations created in the app (source DIRECT). */
  checkIn?: string;
  checkOut?: string;
  unitId?: string;
  acceptConflicts?: boolean;
}

/** A reservation typed in by hand (source DIRECT). */
export interface NewReservation {
  propertyId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  /** STAY (default) or BLOCK; a block has no guest and uses `notes` as the reason. */
  kind?: ReservationKind;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  numberOfGuests?: number | null;
  notes?: string;
  billingName?: string;
  billingNif?: string;
  billingAddress?: string;
  acceptConflicts?: boolean;
}

/** A stay that a new or changed reservation would overlap (409 details). */
export interface OverlappingStay {
  id: string;
  guestName: string | null;
  unitName: string | null;
  checkIn: string;
  checkOut: string;
  source: string;
}

/** The overlapping stays when the API refused a save with 409, otherwise null. */
export function overlapsOf(error: unknown): OverlappingStay[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const d = error.details as { conflicts?: OverlappingStay[] } | undefined;
  return d?.conflicts?.length ? d.conflicts : null;
}

export const api = {
  dashboard: () => get<Dashboard>('/dashboard'),
  calendar: (from: string, to: string, propertyId?: string) => get<CalendarData>('/calendar', { from, to, propertyId }),

  reservations: (filters: ReservationFilters) => get<ReservationList>('/reservations', filters),
  reservation: (id: string) => get<ReservationDetail>(`/reservations/${id}`),
  createReservation: (body: NewReservation) => send<ReservationDetail>('POST', '/reservations', body),
  setReservationKind: (id: string, kind: ReservationKind) => send<ReservationDetail>('POST', `/reservations/${id}/kind`, { kind }),
  calendarExports: () => get<CalendarExport[]>('/calendar-exports'),
  enableCalendarExport: (unitId: string) => send<CalendarExport>('POST', `/calendar-exports/${unitId}`),
  disableCalendarExport: (unitId: string) => request<CalendarExport>(`/calendar-exports/${unitId}`, { method: 'DELETE' }),
  cancelReservation: (id: string) => send<ReservationDetail>('POST', `/reservations/${id}/cancel`),
  editReservation: (id: string, body: ReservationEdit) => send<ReservationDetail>('PATCH', `/reservations/${id}`, body),
  assignUnit: (id: string, unitId: string) => send<ReservationDetail>('POST', `/reservations/${id}/assign-unit`, { unitId }),

  properties: (includeInactive = false) => get<PropertyListItem[]>('/properties', { includeInactive }),
  property: (id: string) => get<PropertyDetail>(`/properties/${id}`),
  createProperty: (body: { name: string; description?: string; address?: string }) => send<Property>('POST', '/properties', body),
  updateProperty: (id: string, body: { name?: string; description?: string; address?: string }) =>
    send<Property>('PATCH', `/properties/${id}`, body),
  deleteProperty: (id: string) =>
    request<{ id: string; name: string; deleted: { reservations: number; units: number; mappings: number; feeds: number } }>(
      `/properties/${id}`,
      { method: 'DELETE' },
    ),
  setPropertyActive: (id: string, active: boolean) =>
    send<Property>('POST', `/properties/${id}/${active ? 'activate' : 'deactivate'}`),

  createUnit: (propertyId: string, body: { name: string; description?: string }) =>
    send<Unit>('POST', `/properties/${propertyId}/units`, body),
  updateUnit: (id: string, body: { name?: string; description?: string }) => send<Unit>('PATCH', `/units/${id}`, body),
  setUnitActive: (id: string, active: boolean) =>
    send<Unit & { upcomingReservations: number }>('POST', `/units/${id}/${active ? 'activate' : 'deactivate'}`),

  integration: (source: string) => get<IntegrationStatus>(`/integrations/${source}`),
  sync: (source: string) => send<SyncRun>('POST', `/integrations/${source}/sync`),
  syncs: (source?: string, limit = 10) => get<SyncRun[]>('/syncs', { source, limit }),

  mappings: (source: string) => get<Mapping[]>('/mappings', { source }),
  updateMapping: (id: string, body: { unitId?: string | null; active?: boolean }) => send<Mapping>('PATCH', `/mappings/${id}`, body),

  feeds: (source: string) => get<IcalFeed[]>(`/integrations/${source}/feeds`),
  createFeed: (source: string, body: { name: string; url: string; propertyId: string; unitId?: string | null }) =>
    send<IcalFeed>('POST', `/integrations/${source}/feeds`, body),
  deleteFeed: (source: string, id: string) =>
    request<{ id: string; name: string; deleted: { reservations: number; mappings: number } }>(
      `/integrations/${source}/feeds/${id}`,
      { method: 'DELETE' },
    ),
  updateFeed: (source: string, id: string, body: { name?: string; url?: string; unitId?: string | null; active?: boolean }) =>
    send<IcalFeed>('PATCH', `/integrations/${source}/feeds/${id}`, body),
};

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
