import { addDays, type IsoDate } from '../../domain/dates';
import type { NormalizedReservation } from '../../domain/reservation';
import type {
  AdapterDescription,
  FetchContext,
  FetchResult,
  ReservationSourceAdapter,
} from '../reservation-source-adapter';

/**
 * DEMO DATA. Fictional guests, fictional Booking identifiers. Dates are
 * relative to today so the dashboard and calendar always look "live".
 *
 * The set deliberately covers: check-ins/outs today, in-house guests, an
 * adjacent pair (not a conflict), an overlapping pair (a conflict), a
 * cancellation, and a room that has no mapping (pending assignment).
 */
export const MOCK_BOOKING_PROPERTY_ID = 'DEMO-HOTEL-1001';

export const MOCK_BOOKING_ROOMS = [
  { externalUnitId: 'DEMO-ROOM-01', name: 'Double Room - Stork', localUnitName: 'Quarto Cegonha' },
  { externalUnitId: 'DEMO-ROOM-02', name: 'Double Room - Flamingo', localUnitName: 'Quarto Flamingo' },
  { externalUnitId: 'DEMO-ROOM-03', name: 'Twin Room - Swallow', localUnitName: 'Quarto Andorinha' },
  { externalUnitId: 'DEMO-ROOM-04', name: 'Double Room - Heron', localUnitName: 'Quarto Garça' },
  { externalUnitId: 'DEMO-ROOM-05', name: 'Double Room - Falcon', localUnitName: 'Quarto Falcão' },
] as const;

/** A room that exists "on Booking" but has no mapping, to demo pending assignment. */
export const MOCK_UNMAPPED_ROOM = { externalUnitId: 'DEMO-ROOM-99', name: 'Family Suite - Garden' } as const;

interface DemoBooking {
  id: string;
  room: string;
  guest: string;
  from: number;
  to: number;
  guests: number;
  cancelled?: boolean;
}

const DEMO_BOOKINGS: DemoBooking[] = [
  { id: 'DEMO-4100001', room: 'DEMO-ROOM-01', guest: 'Ana Ribeiro', from: -3, to: 1, guests: 2 },
  { id: 'DEMO-4100002', room: 'DEMO-ROOM-01', guest: 'Lukas Weber', from: 1, to: 4, guests: 2 },
  { id: 'DEMO-4100003', room: 'DEMO-ROOM-01', guest: 'Chloé Martin', from: 7, to: 10, guests: 1 },
  { id: 'DEMO-4100004', room: 'DEMO-ROOM-02', guest: 'Tomás Ferreira', from: -1, to: 0, guests: 2 },
  { id: 'DEMO-4100005', room: 'DEMO-ROOM-02', guest: 'Emma Johansson', from: 0, to: 3, guests: 2 },
  { id: 'DEMO-4100006', room: 'DEMO-ROOM-02', guest: 'Marco Bianchi', from: -10, to: -7, guests: 2 },
  { id: 'DEMO-4100007', room: 'DEMO-ROOM-03', guest: 'Sofia Almeida', from: 2, to: 6, guests: 2 },
  // Overlaps the booking above by one night: a deliberate conflict.
  { id: 'DEMO-4100008', room: 'DEMO-ROOM-03', guest: 'James Carter', from: 5, to: 8, guests: 1 },
  { id: 'DEMO-4100009', room: 'DEMO-ROOM-04', guest: 'Inês Costa', from: -2, to: 2, guests: 2 },
  { id: 'DEMO-4100010', room: 'DEMO-ROOM-04', guest: 'Pierre Dubois', from: 6, to: 9, guests: 2, cancelled: true },
  { id: 'DEMO-4100011', room: 'DEMO-ROOM-04', guest: 'Hannah Schmidt', from: 12, to: 15, guests: 2 },
  { id: 'DEMO-4100012', room: 'DEMO-ROOM-05', guest: 'Rui Santos', from: 3, to: 5, guests: 1 },
  { id: 'DEMO-4100013', room: 'DEMO-ROOM-05', guest: 'Olivia Brown', from: 10, to: 14, guests: 2 },
  // Arrives on a room with no mapping: must stay unassigned.
  { id: 'DEMO-4100014', room: 'DEMO-ROOM-99', guest: 'Daniel Novak', from: 4, to: 7, guests: 3 },
];

export class BookingMockAdapter implements ReservationSourceAdapter {
  readonly source = 'BOOKING' as const;
  readonly mode = 'mock';

  async describe(): Promise<AdapterDescription> {
    return {
      configured: true,
      summary: 'Demo mode: fictional Booking.com reservations, no real account connected',
      details: { demo: true, reservationCount: DEMO_BOOKINGS.length },
    };
  }

  async fetchReservations(context: FetchContext): Promise<FetchResult> {
    return { reservations: buildDemoReservations(context.today), snapshots: [], errors: [] };
  }
}

export function buildDemoReservations(today: IsoDate): NormalizedReservation[] {
  const roomName = (id: string) =>
    MOCK_BOOKING_ROOMS.find((r) => r.externalUnitId === id)?.name ?? MOCK_UNMAPPED_ROOM.name;
  return DEMO_BOOKINGS.map((b) => ({
    source: 'BOOKING',
    externalId: b.id,
    externalPropertyId: MOCK_BOOKING_PROPERTY_ID,
    externalUnitId: b.room,
    externalUnitName: roomName(b.room),
    guestName: `${b.guest} (demo)`,
    guestEmail: `${b.guest.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@example.com`,
    guestPhone: `+351 900 000 ${b.id.slice(-3)}`,
    checkIn: addDays(today, b.from),
    checkOut: addDays(today, b.to),
    numberOfGuests: b.guests,
    status: b.cancelled ? 'CANCELLED' : 'CONFIRMED',
  }));
}
