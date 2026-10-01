import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isIsoDate, nightsBetween, staysOverlap, todayIn } from './dates';
import { detectConflicts, overlapsFor } from './conflicts';
import { validateManualStay } from './manual-reservation';
import { buildUnitCalendar, selectExportable, type ExportableStay } from './calendar-export';
import { resolveAssignment, type MappingLike } from './mapping-resolution';
import { planReservationChange } from './reservation-change';
import type { NormalizedReservation, StoredReservation } from './reservation';
import { reservationsMissingFromSnapshot } from './snapshot-cancellation';
import { validateNormalizedReservation } from './validation';

const incoming = (over: Partial<NormalizedReservation> = {}): NormalizedReservation => ({
  source: 'BOOKING',
  externalId: '123',
  externalPropertyId: 'H1',
  externalUnitId: 'R1',
  guestName: 'João Silva',
  guestEmail: 'joao@example.com',
  guestPhone: '+351 900 000 001',
  checkIn: '2026-10-02',
  checkOut: '2026-10-05',
  numberOfGuests: 2,
  status: 'CONFIRMED',
  ...over,
});

const stored = (over: Partial<StoredReservation> = {}): StoredReservation => ({
  id: 'res-1',
  propertyId: 'prop-1',
  unitId: 'unit-1',
  unitAssignedManually: false,
  manualFields: [],
  externalPropertyRef: 'H1',
  externalUnitRef: 'R1',
  guestName: 'João Silva',
  guestEmail: 'joao@example.com',
  guestPhone: '+351 900 000 001',
  checkIn: '2026-10-02',
  checkOut: '2026-10-05',
  numberOfGuests: 2,
  status: 'CONFIRMED',
  ...over,
});

const assignment = { propertyId: 'prop-1', unitId: 'unit-1' };

describe('dates', () => {
  it('validates ISO dates strictly', () => {
    assert.equal(isIsoDate('2026-10-02'), true);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('02/10/2026'), false);
  });

  it('adds days across month boundaries and counts nights', () => {
    assert.equal(addDays('2026-09-29', 3), '2026-10-02');
    assert.equal(nightsBetween('2026-10-02', '2026-10-05'), 3);
  });

  it('computes today in the property timezone, not UTC', () => {
    // 23:30 UTC on 29 Sep is already 30 Sep in Lisbon (UTC+1 in summer).
    assert.equal(todayIn('Europe/Lisbon', new Date('2026-09-29T23:30:00Z')), '2026-09-30');
    assert.equal(todayIn('UTC', new Date('2026-09-29T23:30:00Z')), '2026-09-29');
  });

  it('treats check-in as inclusive and check-out as exclusive', () => {
    const a = { checkIn: '2026-10-02', checkOut: '2026-10-05' };
    assert.equal(staysOverlap(a, { checkIn: '2026-10-05', checkOut: '2026-10-07' }), false);
    assert.equal(staysOverlap(a, { checkIn: '2026-10-04', checkOut: '2026-10-07' }), true);
    assert.equal(staysOverlap(a, { checkIn: '2026-09-30', checkOut: '2026-10-02' }), false);
    assert.equal(staysOverlap(a, { checkIn: '2026-10-03', checkOut: '2026-10-04' }), true);
  });
});

describe('conflict detection', () => {
  const base = { status: 'CONFIRMED' as const };

  it('flags overlapping reservations in the same unit', () => {
    const conflicts = detectConflicts([
      { ...base, id: 'joao', unitId: 'cegonha', checkIn: '2026-10-02', checkOut: '2026-10-05' },
      { ...base, id: 'maria', unitId: 'cegonha', checkIn: '2026-10-04', checkOut: '2026-10-07' },
    ]);
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0]!.reservationIds, ['joao', 'maria']);
    assert.equal(conflicts[0]!.overlapFrom, '2026-10-04');
    assert.equal(conflicts[0]!.overlapTo, '2026-10-05');
  });

  it('does not flag adjacent stays (02->05 and 05->07)', () => {
    const conflicts = detectConflicts([
      { ...base, id: 'a', unitId: 'cegonha', checkIn: '2026-10-02', checkOut: '2026-10-05' },
      { ...base, id: 'b', unitId: 'cegonha', checkIn: '2026-10-05', checkOut: '2026-10-07' },
    ]);
    assert.equal(conflicts.length, 0);
  });

  it('ignores other units, cancelled and unassigned reservations', () => {
    const conflicts = detectConflicts([
      { ...base, id: 'a', unitId: 'cegonha', checkIn: '2026-10-02', checkOut: '2026-10-05' },
      { ...base, id: 'b', unitId: 'flamingo', checkIn: '2026-10-02', checkOut: '2026-10-05' },
      { id: 'c', unitId: 'cegonha', checkIn: '2026-10-03', checkOut: '2026-10-04', status: 'CANCELLED' },
      { ...base, id: 'd', unitId: null, checkIn: '2026-10-03', checkOut: '2026-10-04' },
    ]);
    assert.equal(conflicts.length, 0);
  });

  it('finds every pair when a long stay overlaps several short ones', () => {
    const conflicts = detectConflicts([
      { ...base, id: 'long', unitId: 'u', checkIn: '2026-10-01', checkOut: '2026-10-10' },
      { ...base, id: 's1', unitId: 'u', checkIn: '2026-10-02', checkOut: '2026-10-03' },
      { ...base, id: 's2', unitId: 'u', checkIn: '2026-10-08', checkOut: '2026-10-12' },
    ]);
    assert.deepEqual(
      conflicts.map((c) => c.reservationIds.join('+')).sort(),
      ['long+s1', 'long+s2'],
    );
  });
});

describe('mapping resolution', () => {
  const mappings: MappingLike[] = [
    { source: 'BOOKING', externalPropertyId: 'H1', externalUnitId: 'R1', propertyId: 'carnot', unitId: 'cegonha', active: true },
    { source: 'BOOKING', externalPropertyId: 'H1', externalUnitId: 'R2', propertyId: 'carnot', unitId: null, active: true },
    { source: 'BOOKING', externalPropertyId: 'H1', externalUnitId: 'R3', propertyId: 'carnot', unitId: 'garca', active: false },
    { source: 'BOOKING', externalPropertyId: 'H2', externalUnitId: 'R1', propertyId: 'other', unitId: 'other-unit', active: true },
  ];

  it('resolves a known external room to the mapped unit', () => {
    assert.deepEqual(resolveAssignment({ source: 'BOOKING', externalPropertyId: 'H1', externalUnitId: 'R1' }, mappings), {
      propertyId: 'carnot',
      unitId: 'cegonha',
      resolvedBy: 'unit-mapping',
    });
  });

  it('keeps the property but no unit for an unknown room of a known property', () => {
    const a = resolveAssignment({ source: 'BOOKING', externalPropertyId: 'H1', externalUnitId: 'R99' }, mappings);
    assert.equal(a.propertyId, 'carnot');
    assert.equal(a.unitId, null);
  });

  it('does not use inactive mappings', () => {
    const a = resolveAssignment({ source: 'BOOKING', externalPropertyId: 'H1', externalUnitId: 'R3' }, mappings);
    assert.equal(a.unitId, null);
    assert.equal(a.resolvedBy, 'property-mapping');
  });

  it('keeps properties isolated: same room id under another property resolves separately', () => {
    const a = resolveAssignment({ source: 'BOOKING', externalPropertyId: 'H2', externalUnitId: 'R1' }, mappings);
    assert.equal(a.propertyId, 'other');
    assert.equal(a.unitId, 'other-unit');
  });

  it('resolves nothing for an unknown property or another source', () => {
    assert.equal(resolveAssignment({ source: 'BOOKING', externalPropertyId: 'H9', externalUnitId: 'R1' }, mappings).resolvedBy, 'none');
    assert.equal(resolveAssignment({ source: 'AIRBNB', externalPropertyId: 'H1', externalUnitId: 'R1' }, mappings).resolvedBy, 'none');
  });
});

describe('reservation change planning', () => {
  it('creates a reservation that does not exist yet', () => {
    const plan = planReservationChange(null, incoming(), assignment);
    assert.equal(plan.kind, 'create');
  });

  it('reports no change when the same reservation is synchronized again', () => {
    assert.equal(planReservationChange(stored(), incoming(), assignment).kind, 'unchanged');
  });

  it('updates only the fields that changed', () => {
    const plan = planReservationChange(stored(), incoming({ checkOut: '2026-10-06', numberOfGuests: 3 }), assignment);
    assert.equal(plan.kind, 'update');
    if (plan.kind !== 'update') return;
    assert.deepEqual(plan.changedFields.sort(), ['checkOut', 'numberOfGuests']);
    assert.equal(plan.transition, null);
  });

  it('turns a cancellation into a status change', () => {
    const plan = planReservationChange(stored(), incoming({ status: 'CANCELLED' }), assignment);
    assert.equal(plan.kind, 'update');
    if (plan.kind !== 'update') return;
    assert.deepEqual(plan.changes, { status: 'CANCELLED' });
    assert.equal(plan.transition, 'cancelled');
  });

  it('does not overwrite data the source does not provide', () => {
    const plan = planReservationChange(
      stored(),
      incoming({ guestEmail: undefined, guestPhone: undefined, numberOfGuests: undefined }),
      assignment,
    );
    assert.equal(plan.kind, 'unchanged');
  });

  it('never moves a unit that a person assigned by hand', () => {
    const plan = planReservationChange(
      stored({ unitId: 'manual-unit', unitAssignedManually: true }),
      incoming(),
      { propertyId: 'prop-1', unitId: null },
    );
    assert.equal(plan.kind, 'unchanged');
  });

  it('never overwrites guest fields a person filled in by hand', () => {
    const plan = planReservationChange(
      stored({ guestName: 'Maria Costa', numberOfGuests: 2, manualFields: ['guestName', 'numberOfGuests'] }),
      incoming({ guestName: 'CLOSED', numberOfGuests: 5, guestEmail: 'new@example.test' }),
      assignment,
    );
    assert.equal(plan.kind, 'update');
    if (plan.kind !== 'update') return;
    assert.deepEqual(plan.changes, { guestEmail: 'new@example.test' });
  });

  it('assigns the unit once a mapping exists for a previously unassigned reservation', () => {
    const plan = planReservationChange(stored({ unitId: null }), incoming(), assignment);
    assert.equal(plan.kind, 'update');
    if (plan.kind !== 'update') return;
    assert.deepEqual(plan.changes, { unitId: 'unit-1' });
  });
});

describe('cancellation by disappearance from a snapshot', () => {
  const scope = (present: string[]) => ({
    source: 'BOOKING' as const,
    externalPropertyId: 'H1',
    externalUnitId: 'R1',
    coversStaysEndingAfter: '2026-09-29',
    presentExternalIds: new Set(present),
  });

  it('cancels upcoming reservations missing from the feed, not past ones', () => {
    const r = reservationsMissingFromSnapshot(scope(['keep']), [
      { id: 'a', externalId: 'keep', checkOut: '2026-10-05', status: 'CONFIRMED' },
      { id: 'b', externalId: 'gone', checkOut: '2026-10-05', status: 'CONFIRMED' },
      { id: 'c', externalId: 'old', checkOut: '2026-09-20', status: 'CONFIRMED' },
      { id: 'd', externalId: 'was-cancelled', checkOut: '2026-10-05', status: 'CANCELLED' },
    ]);
    assert.deepEqual(r.toCancel, ['b']);
  });

  it('refuses to act on an empty feed while upcoming reservations exist', () => {
    const r = reservationsMissingFromSnapshot(scope([]), [
      { id: 'a', externalId: 'x', checkOut: '2026-10-05', status: 'CONFIRMED' },
    ]);
    assert.deepEqual(r.toCancel, []);
    assert.ok(r.skippedReason);
  });
});

describe('validation of incoming reservations', () => {
  it('accepts a well-formed reservation', () => {
    assert.deepEqual(validateNormalizedReservation(incoming()), []);
  });

  it('rejects zero-night stays and missing ids', () => {
    const problems = validateNormalizedReservation(incoming({ externalId: '', checkOut: '2026-10-02' }));
    assert.equal(problems.length, 2);
  });
});

describe('manual reservations', () => {
  const stay = (id: string, checkIn: string, checkOut: string, unitId = 'u1', status: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED') => ({
    id,
    unitId,
    checkIn,
    checkOut,
    status,
  });
  const others = [
    stay('a', '2026-10-02', '2026-10-05'),
    stay('b', '2026-10-05', '2026-10-07'),
    stay('c', '2026-10-03', '2026-10-04', 'u2'),
    stay('d', '2026-10-03', '2026-10-06', 'u1', 'CANCELLED'),
  ];

  it('finds the confirmed stays of the same unit that a new stay overlaps', () => {
    assert.deepEqual(overlapsFor({ unitId: 'u1', checkIn: '2026-10-04', checkOut: '2026-10-06' }, others).map((o) => o.id), ['a', 'b']);
  });

  it('treats adjacent stays, other units and cancelled stays as free', () => {
    assert.deepEqual(overlapsFor({ unitId: 'u1', checkIn: '2026-10-07', checkOut: '2026-10-09' }, others), []);
    assert.deepEqual(overlapsFor({ unitId: 'u1', checkIn: '2026-09-30', checkOut: '2026-10-02' }, others), []);
  });

  it('ignores the reservation being edited', () => {
    assert.deepEqual(overlapsFor({ id: 'a', unitId: 'u1', checkIn: '2026-10-02', checkOut: '2026-10-04' }, others), []);
  });

  it('validates dates, guest name and number of guests', () => {
    assert.deepEqual(validateManualStay({ checkIn: '2026-10-02', checkOut: '2026-10-05', guestName: 'Maria' }), []);
    assert.deepEqual(validateManualStay({ checkIn: '2026-10-05', checkOut: '2026-10-05', guestName: 'Maria' }), ['Check-out must be after check-in']);
    assert.deepEqual(validateManualStay({ checkIn: '2026-02-30', checkOut: '2026-03-02', guestName: ' ' }), ['Choose a valid check-in date', 'Enter the guest name']);
    assert.deepEqual(validateManualStay({ checkIn: '2026-10-02', checkOut: '2026-10-05', guestName: 'M', numberOfGuests: 0 }), ['Number of guests must be between 1 and 100']);
  });
});

describe('blocked dates', () => {
  it('need no guest name, while a guest stay does', () => {
    assert.deepEqual(validateManualStay({ checkIn: '2026-10-02', checkOut: '2026-10-05', kind: 'BLOCK' }), []);
    assert.deepEqual(validateManualStay({ checkIn: '2026-10-02', checkOut: '2026-10-05', kind: 'STAY' }), ['Enter the guest name']);
  });
});

describe('calendar export (iCal for Booking)', () => {
  const s = (id: string, over: Partial<ExportableStay> = {}): ExportableStay => ({
    id,
    source: 'DIRECT',
    status: 'CONFIRMED',
    kind: 'STAY',
    checkIn: '2026-10-10',
    checkOut: '2026-10-12',
    ...over,
  });

  it('exports direct stays and blocks, never Booking\'s own, cancelled or long-past ones', () => {
    const picked = selectExportable(
      [
        s('direct'),
        s('block', { kind: 'BLOCK', checkIn: '2026-10-05', checkOut: '2026-10-06' }),
        s('booking', { source: 'BOOKING' }),
        s('booking-block', { source: 'BOOKING', kind: 'BLOCK' }),
        s('cancelled', { status: 'CANCELLED' }),
        s('old', { checkIn: '2026-09-01', checkOut: '2026-09-20' }),
        s('recent', { checkIn: '2026-09-20', checkOut: '2026-09-28' }),
        s('airbnb', { source: 'AIRBNB', checkIn: '2026-11-01', checkOut: '2026-11-02' }),
      ],
      '2026-10-01',
    );
    assert.deepEqual(picked.map((p) => p.id), ['recent', 'block', 'direct', 'airbnb']);
  });

  it('writes a valid all-day calendar with no guest data, CRLF and folded lines', () => {
    const text = buildUnitCalendar({
      calendarName: 'Carnot House · Quarto Garça, piso 1 — a very long name that needs folding to fit 75 octets',
      stays: [s('11111111-1111-4111-8111-111111111111', { guestName: 'Maria' } as Partial<ExportableStay>)],
      now: new Date('2026-10-01T12:34:56.789Z'),
    });
    assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
    assert.ok(text.endsWith('END:VCALENDAR\r\n'));
    assert.match(text, /\r\nDTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261012\r\n/);
    assert.match(text, /\r\nUID:11111111-1111-4111-8111-111111111111@accommodation-manager-portal\r\n/);
    assert.match(text, /\r\nDTSTAMP:20261001T123456Z\r\n/);
    assert.match(text, /\r\nSUMMARY:Not available\r\n/);
    assert.equal(/Maria/.test(text), false, 'no guest data');
    assert.match(text, /X-WR-CALNAME:Carnot House · Quarto Garça\\, piso 1/);
    for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line}`);
    assert.equal(text.includes('\n') && !text.split('\r\n').some((l) => l.includes('\n')), true, 'only CRLF line endings');
  });

  it('an empty selection still gives a valid calendar', () => {
    const text = buildUnitCalendar({ calendarName: 'Unit', stays: [], now: new Date('2026-10-01T00:00:00Z') });
    assert.equal((text.match(/BEGIN:VEVENT/g) ?? []).length, 0);
    assert.ok(text.includes('BEGIN:VCALENDAR') && text.includes('END:VCALENDAR'));
  });
});
