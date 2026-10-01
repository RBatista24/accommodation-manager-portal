import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcal } from './ical/ical-parser';
import { BookingIcalAdapter, type IcalFeedConfig, type IcalFeedStore } from './booking/booking-ical.adapter';
import { BookingMockAdapter, MOCK_UNMAPPED_ROOM } from './booking/booking-mock.adapter';
import { detectConflicts } from '../domain/conflicts';
import { validateNormalizedReservation } from '../domain/validation';

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Example//Test//EN',
  'BEGIN:VEVENT',
  'UID:abc123@example.test',
  'DTSTART;VALUE=DATE:20261002',
  'DTEND;VALUE=DATE:20261005',
  'SUMMARY:Jo\\, Silva',
  'DESCRIPTION:A long description that is folded',
  '  onto a second line',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:block-1',
  'DTSTART;VALUE=DATE:20261010',
  'DTEND;VALUE=DATE:20261012',
  'SUMMARY:CLOSED - Not available',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:broken',
  'DTSTART;VALUE=DATE:20261015',
  'DTEND;VALUE=DATE:20261014',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCal parser', () => {
  it('reads all-day events, unescapes text and unfolds long lines', () => {
    const r = parseIcal(SAMPLE_ICS);
    assert.equal(r.isCalendar, true);
    assert.equal(r.events.length, 2);
    assert.deepEqual(r.events[0], {
      uid: 'abc123@example.test',
      summary: 'Jo, Silva',
      description: 'A long description that is folded onto a second line',
      start: '2026-10-02',
      end: '2026-10-05',
      status: null,
    });
    assert.equal(r.skipped.length, 1);
    assert.equal(r.skipped[0]!.uid, 'broken');
  });

  it('defaults a missing end date to one night and takes the date of date-times', () => {
    const r = parseIcal('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART:20261002T140000Z\nEND:VEVENT\nEND:VCALENDAR');
    assert.equal(r.events[0]!.start, '2026-10-02');
    assert.equal(r.events[0]!.end, '2026-10-03');
  });

  it('recognises content that is not a calendar', () => {
    assert.equal(parseIcal('<html>login</html>').isCalendar, false);
  });
});

describe('Booking iCal adapter', () => {
  const feed: IcalFeedConfig = {
    id: 'feed-1',
    name: 'Quarto Cegonha feed',
    url: 'https://example.test/secret-token.ics',
    externalPropertyId: 'HOTEL-1',
    externalUnitId: 'ROOM-1',
  };

  const store = (feeds: IcalFeedConfig[]) => {
    const outcomes: unknown[] = [];
    const s: IcalFeedStore = {
      listActiveFeeds: async () => feeds,
      recordFetch: async (_id, outcome) => {
        outcomes.push(outcome);
      },
    };
    return { s, outcomes };
  };

  it('normalizes feed events and declares a snapshot for cancellation detection', async () => {
    const { s } = store([feed]);
    const adapter = new BookingIcalAdapter(s, async () => SAMPLE_ICS);
    const r = await adapter.fetchReservations({ today: '2026-09-29' });

    assert.equal(r.reservations.length, 2);
    const guest = r.reservations[0]!;
    assert.equal(guest.externalId, 'ROOM-1:abc123@example.test');
    assert.equal(guest.guestName, 'Jo, Silva');
    assert.equal(guest.guestEmail, undefined, 'iCal has no e-mail; must not overwrite');
    assert.equal(r.reservations[1]!.guestName, null, 'generic "not available" text is not a guest name');
    for (const res of r.reservations) assert.deepEqual(validateNormalizedReservation(res), []);

    assert.equal(r.snapshots.length, 1);
    assert.equal(r.snapshots[0]!.presentExternalIds.size, 2);
    assert.equal(r.errors.length, 1, 'the unreadable event is reported');
  });

  it('reports an unreachable feed without leaking its URL, and keeps others going', async () => {
    const other = { ...feed, id: 'feed-2', name: 'Quarto Flamingo feed', externalUnitId: 'ROOM-2', url: 'https://example.test/ok.ics' };
    const { s, outcomes } = store([feed, other]);
    const adapter = new BookingIcalAdapter(s, async (url) => {
      if (url.includes('secret-token')) throw new Error(`fetch failed for ${url}`);
      return SAMPLE_ICS;
    });
    const r = await adapter.fetchReservations({ today: '2026-09-29' });

    assert.equal(r.snapshots.length, 1, 'no snapshot for the failed feed, so nothing is wrongly cancelled');
    assert.equal(r.errors.some((e) => e.message.includes('Quarto Cegonha feed')), true);
    assert.equal(JSON.stringify([r.errors, outcomes]).includes('secret-token'), false);
  });

  it('warns when every calendar is readable but holds no bookings', async () => {
    const { s } = store([feed]);
    const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n';
    const r = await new BookingIcalAdapter(s, async () => empty).fetchReservations({ today: '2026-09-29' });
    assert.equal(r.reservations.length, 0);
    assert.equal(r.snapshots.length, 1);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0]!.message, /no bookings/);
  });

  it('fails the sync when no feed can be read', async () => {
    const { s } = store([feed]);
    const adapter = new BookingIcalAdapter(s, async () => '<html>expired</html>');
    await assert.rejects(adapter.fetchReservations({ today: '2026-09-29' }), /could be read/);
  });
});

describe('Booking demo adapter', () => {
  it('produces valid demo data with one conflict, one cancellation and one unmapped room', async () => {
    const r = await new BookingMockAdapter().fetchReservations({ today: '2026-09-29' });
    for (const res of r.reservations) assert.deepEqual(validateNormalizedReservation(res), []);
    assert.equal(r.reservations.filter((x) => x.status === 'CANCELLED').length, 1);
    assert.equal(r.reservations.filter((x) => x.externalUnitId === MOCK_UNMAPPED_ROOM.externalUnitId).length, 1);
    const conflicts = detectConflicts(
      r.reservations.map((x) => ({ id: x.externalId, unitId: x.externalUnitId, checkIn: x.checkIn, checkOut: x.checkOut, status: x.status })),
    );
    assert.equal(conflicts.length, 1);
    assert.equal(new Set(r.reservations.map((x) => x.externalId)).size, r.reservations.length, 'ids are unique');
  });
});

describe('round trip with our own calendar export', () => {
  it('the iCal reader understands the calendar we publish for Booking', async () => {
    const { buildUnitCalendar } = await import('../domain/calendar-export');
    const text = buildUnitCalendar({
      calendarName: 'Carnot House · Quarto Garça',
      stays: [
        { id: 'a', source: 'DIRECT', status: 'CONFIRMED', kind: 'STAY', checkIn: '2026-10-10', checkOut: '2026-10-12' },
        { id: 'b', source: 'DIRECT', status: 'CONFIRMED', kind: 'BLOCK', checkIn: '2026-10-20', checkOut: '2026-10-21' },
      ],
      now: new Date('2026-10-01T12:00:00Z'),
    });
    const parsed = parseIcal(text);
    assert.equal(parsed.isCalendar, true);
    assert.deepEqual(
      parsed.events.map((e) => [e.uid, e.start, e.end, e.summary]),
      [
        ['a@accommodation-manager-portal', '2026-10-10', '2026-10-12', 'Not available'],
        ['b@accommodation-manager-portal', '2026-10-20', '2026-10-21', 'Not available'],
      ],
    );
  });
});
