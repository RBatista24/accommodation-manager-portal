/** Response shapes of the API (see apps/api presenters). */
import type { IsoDate } from './dates';

export type ReservationSource = 'BOOKING' | 'AIRBNB' | 'DIRECT' | 'OTHER';
export type ReservationStatus = 'CONFIRMED' | 'CANCELLED';
export type SyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface Unit {
  id: string;
  propertyId: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyListItem extends Property {
  unitCount: number;
  units: Unit[];
}

export interface PropertyDetail extends Property {
  units: Unit[];
  reservationSummary: { total: number; upcoming: number; inHouse: number; pendingAssignment: number; cancelled: number };
}

export interface Reservation {
  id: string;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  source: ReservationSource;
  externalId: string | null;
  externalUnitRef: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  numberOfGuests: number | null;
  status: ReservationStatus;
  notes: string | null;
  /** Empty means the guest is billed (guestName). */
  billingName: string | null;
  billingNif: string | null;
  billingAddress: string | null;
  pendingAssignment: boolean;
  unitAssignedManually: boolean;
  /** Guest fields filled in by hand; synchronization never overwrites them. */
  manualFields: string[];
  hasConflict?: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conflict {
  unitId: string;
  unitName: string | null;
  propertyId: string;
  overlapFrom: IsoDate;
  overlapTo: IsoDate;
  reservations: { id: string; guestName: string | null; checkIn: IsoDate; checkOut: IsoDate; source: ReservationSource; externalId: string | null }[];
}

export interface ReservationDetail extends Reservation {
  conflicts: Conflict[];
  assignableUnits: { id: string; name: string }[];
  lastSync: { id: string; status: SyncStatus; finishedAt: string | null } | null;
  history: { id: string; timestamp: string; action: string; user: { id: string; name: string } | null; metadata: unknown }[];
}

export interface ReservationList {
  items: Reservation[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SyncRun {
  id: string;
  source: ReservationSource;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  counts: {
    fetched: number;
    created: number;
    updated: number;
    unchanged: number;
    cancelled: number;
    pendingAssignment: number;
    errors: number;
  };
  errorMessage: string | null;
  errors: { externalId?: string; scope?: string; message: string }[];
}

export interface IntegrationStatus {
  source: ReservationSource;
  mode: string;
  configured: boolean;
  summary: string;
  details: Record<string, unknown>;
  syncing: boolean;
  lastSync: SyncRun | null;
  lastSuccessfulSyncAt: string | null;
  mappings: { total: number; withoutUnit: number };
}

export interface Mapping {
  id: string;
  source: ReservationSource;
  externalPropertyId: string;
  externalUnitId: string;
  externalName: string | null;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  active: boolean;
  needsUnit: boolean;
  reservationCount?: number;
}

export interface IcalFeed {
  id: string;
  source: ReservationSource;
  name: string;
  urlPreview: string;
  externalPropertyId: string;
  externalUnitId: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  mappingId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  /** Reservations imported through this link. */
  reservationCount?: number;
}

export interface CalendarUnit {
  id: string;
  name: string;
  active: boolean;
  propertyId: string;
  propertyName: string;
}

export interface CalendarData {
  from: IsoDate;
  to: IsoDate;
  units: CalendarUnit[];
  reservations: Reservation[];
  conflicts: Conflict[];
}

export interface AttentionItem {
  kind: 'PENDING_ASSIGNMENT' | 'CONFLICT' | 'SYNC_FAILED' | 'SYNC_PARTIAL' | string;
  severity: 'warning' | 'error';
  message: string;
  count: number;
}

export interface Dashboard {
  date: IsoDate;
  today: { checkIns: Reservation[]; checkOuts: Reservation[]; inHouse: Reservation[] };
  occupancy: {
    totalUnits: number;
    occupiedUnits: number;
    availableUnits: number;
    units: { id: string; name: string; propertyId: string; propertyName: string; occupied: boolean; currentReservationId: string | null }[];
  };
  upcoming: Reservation[];
  pendingAssignment: Reservation[];
  conflicts: Conflict[];
  syncs: { source: ReservationSource; lastSync: SyncRun | null }[];
  attention: AttentionItem[];
}
