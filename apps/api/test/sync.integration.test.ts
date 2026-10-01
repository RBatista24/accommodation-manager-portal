/**
 * Critical domain behaviour against a real PostgreSQL (spec section 45).
 * Run with: pnpm test:integration   (uses .env.test; the test DB is wiped)
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toIsoDate } from '../src/domain/dates';
import { BookingIcalAdapter, type IcalFeedStore } from '../src/integrations/booking/booking-ical.adapter';
import { SourceUnavailableError } from '../src/integrations/reservation-source-adapter';
import { SyncService } from '../src/modules/sync/sync.service';
import { booking, createProperty, FakeAdapter, makeContext, resetDatabase, TODAY, type Ctx } from './helpers';

let ctx: Ctx;

before(async () => {
  ctx = makeContext();
  await ctx.prisma.$connect();
});

after(async () => {
  await ctx.prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(ctx.prisma);
});

async function carnot() {
  return createProperty(ctx.prisma, {
    name: 'Carnot House',
    externalPropertyId: 'HOTEL-1',
    rooms: { 'ROOM-1': 'Quarto Cegonha', 'ROOM-2': 'Quarto Flamingo' },
  });
}

describe('reservation idempotency', () => {
  it('running the same synchronization twice results in exactly one reservation', async () => {
    await carnot();
    const adapter = new FakeAdapter([booking({ externalId: '123' })]);

    const first = await ctx.sync.run(adapter);
    const second = await ctx.sync.run(adapter);

    assert.equal(await ctx.prisma.reservation.count(), 1);
    assert.equal(first.createdCount, 1);
    assert.equal(second.createdCount, 0);
    assert.equal(second.unchangedCount, 1);
    assert.equal(second.status, 'SUCCESS');
  });

  it('the database itself refuses a second row for the same (source, externalId)', async () => {
    const { property } = await carnot();
    const data = {
      propertyId: property.id,
      source: 'BOOKING' as const,
      externalId: 'dup',
      checkIn: new Date('2026-10-02'),
      checkOut: new Date('2026-10-05'),
    };
    await ctx.prisma.reservation.create({ data });
    await assert.rejects(ctx.prisma.reservation.create({ data }), (err: { code?: string }) => err.code === 'P2002');
  });

  it('two sync runners racing on the same new reservation still create only one', async () => {
    await carnot();
    const other = new SyncService(ctx.prisma, ctx.audit, ctx.clock);
    const adapter = new FakeAdapter([booking({ externalId: 'race' })]);
    // Different runner instances, so the in-process lock does not serialize them.
    const results = await Promise.allSettled([ctx.sync.run(adapter), other.run(adapter)]);
    assert.ok(results.some((r) => r.status === 'fulfilled'));
    assert.equal(await ctx.prisma.reservation.count({ where: { externalId: 'race' } }), 1);
  });
});

describe('reservation update', () => {
  it('an existing Booking reservation is updated rather than duplicated', async () => {
    await carnot();
    const adapter = new FakeAdapter([booking()]);
    await ctx.sync.run(adapter);

    adapter.reservations = [booking({ checkOut: '2026-10-06', numberOfGuests: 3 })];
    const run = await ctx.sync.run(adapter);

    const all = await ctx.prisma.reservation.findMany();
    assert.equal(all.length, 1);
    assert.equal(toIsoDate(all[0]!.checkOut), '2026-10-06');
    assert.equal(all[0]!.numberOfGuests, 3);
    assert.equal(run.updatedCount, 1);
    const logged = await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_UPDATED', entityId: all[0]!.id } });
    assert.equal(logged, 1);
  });
});

describe('cancellation', () => {
  it('a Booking cancellation sets status CANCELLED without deleting the reservation', async () => {
    await carnot();
    const adapter = new FakeAdapter([booking()]);
    await ctx.sync.run(adapter);

    adapter.reservations = [booking({ status: 'CANCELLED' })];
    const run = await ctx.sync.run(adapter);

    const all = await ctx.prisma.reservation.findMany();
    assert.equal(all.length, 1, 'still stored');
    assert.equal(all[0]!.status, 'CANCELLED');
    assert.equal(run.cancelledCount, 1);
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_CANCELLED' } }), 1);
  });

  it('a booking that disappears from an iCal feed is cancelled, but an empty feed cancels nothing', async () => {
    await carnot();
    const store: IcalFeedStore = {
      listActiveFeeds: async () => [
        { id: 'f1', name: 'Cegonha', url: 'https://example.test/x.ics', externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1' },
      ],
      recordFetch: async () => undefined,
    };
    const ics = (events: [string, string, string][]) =>
      [
        'BEGIN:VCALENDAR',
        ...events.flatMap(([uid, s, e]) => ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${s}`, `DTEND;VALUE=DATE:${e}`, 'SUMMARY:Guest', 'END:VEVENT']),
        'END:VCALENDAR',
      ].join('\r\n');

    let feed = ics([['a', '20261003', '20261006'], ['b', '20261010', '20261012']]);
    const adapter = new BookingIcalAdapter(store, async () => feed);
    await ctx.sync.run(adapter);
    assert.equal(await ctx.prisma.reservation.count({ where: { status: 'CONFIRMED' } }), 2);

    feed = ics([['a', '20261003', '20261006']]);
    const second = await ctx.sync.run(adapter);
    assert.equal(second.cancelledCount, 1);
    const b = await ctx.prisma.reservation.findFirst({ where: { externalId: 'ROOM-1:b' } });
    assert.equal(b?.status, 'CANCELLED');

    feed = ics([]);
    const third = await ctx.sync.run(adapter);
    assert.equal(third.cancelledCount, 0, 'an empty feed looks like a glitch, not mass cancellation');
    assert.equal(third.status, 'PARTIAL');
    const a = await ctx.prisma.reservation.findFirst({ where: { externalId: 'ROOM-1:a' } });
    assert.equal(a?.status, 'CONFIRMED');
  });
});

describe('mapping', () => {
  it('a known Booking room resolves to the correct local unit', async () => {
    const { units } = await carnot();
    await ctx.sync.run(new FakeAdapter([booking({ externalUnitId: 'ROOM-2' })]));
    const r = await ctx.prisma.reservation.findFirstOrThrow();
    assert.equal(r.unitId, units['Quarto Flamingo']);
  });
});

describe('unassigned reservations', () => {
  it('an unknown Booking room gives unitId = NULL, is kept, and becomes visible as pending', async () => {
    const { property, units } = await carnot();
    const run = await ctx.sync.run(new FakeAdapter([booking({ externalUnitId: 'ROOM-99', externalUnitName: 'Garden suite' })]));

    const r = await ctx.prisma.reservation.findFirstOrThrow();
    assert.equal(r.propertyId, property.id);
    assert.equal(r.unitId, null);
    assert.equal(run.pendingCount, 1);

    const list = await ctx.reservations.list({ unassigned: true });
    assert.equal(list.total, 1);
    assert.equal(list.items[0]!.pendingAssignment, true);

    // The unknown room is recorded as a mapping that still needs a unit...
    const mapping = await ctx.prisma.sourceMapping.findFirstOrThrow({ where: { externalUnitId: 'ROOM-99' } });
    assert.equal(mapping.unitId, null);
    assert.equal(mapping.externalName, 'Garden suite');

    // ...and linking it resolves the waiting reservation.
    const updated = await ctx.mappings.update(mapping.id, { unitId: units['Quarto Cegonha'] }, null);
    assert.equal(updated.reassignedReservations, 1);
    const resolved = await ctx.prisma.reservation.findFirstOrThrow();
    assert.equal(resolved.unitId, units['Quarto Cegonha']);
  });

  it('a reservation for a property nobody mapped is reported, not attached to a random property', async () => {
    await carnot();
    const run = await ctx.sync.run(new FakeAdapter([booking({ externalPropertyId: 'HOTEL-UNKNOWN' })]));
    assert.equal(await ctx.prisma.reservation.count(), 0);
    assert.equal(run.errorCount, 1);
    assert.equal(run.status, 'FAILED');
  });

  it('a unit assigned by hand is not changed by later synchronizations', async () => {
    const { units } = await carnot();
    const adapter = new FakeAdapter([booking({ externalUnitId: 'ROOM-99' })]);
    await ctx.sync.run(adapter);
    const r = await ctx.prisma.reservation.findFirstOrThrow();

    await ctx.reservations.assignUnit(r.id, units['Quarto Flamingo']!, (await ctx.prisma.user.create({ data: { name: 'Owner', email: 'o@example.com' } })).id);
    await ctx.sync.run(adapter);

    const after = await ctx.prisma.reservation.findFirstOrThrow();
    assert.equal(after.unitId, units['Quarto Flamingo']);
    assert.equal(after.unitAssignedManually, true);
  });
});

describe('conflict detection', () => {
  it('flags overlapping reservations in the same unit, but not adjacent ones', async () => {
    await carnot();
    await ctx.sync.run(
      new FakeAdapter([
        booking({ externalId: 'joao', guestName: 'João Silva', checkIn: '2026-10-02', checkOut: '2026-10-05' }),
        booking({ externalId: 'maria', guestName: 'Maria Silva', checkIn: '2026-10-04', checkOut: '2026-10-07' }),
        booking({ externalId: 'adjacent', externalUnitId: 'ROOM-2', checkIn: '2026-10-02', checkOut: '2026-10-05' }),
        booking({ externalId: 'next', externalUnitId: 'ROOM-2', checkIn: '2026-10-05', checkOut: '2026-10-07' }),
      ]),
    );

    const conflicts = await ctx.conflicts.find({ from: TODAY });
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0]!.reservations.map((r) => r.guestName).sort(), ['João Silva', 'Maria Silva']);
    assert.equal(conflicts[0]!.overlapFrom, '2026-10-04');
    assert.equal(conflicts[0]!.overlapTo, '2026-10-05');

    const list = await ctx.reservations.list({ conflicts: true });
    assert.equal(list.total, 2);
  });

  it('a cancelled reservation no longer conflicts', async () => {
    await carnot();
    const adapter = new FakeAdapter([
      booking({ externalId: 'a', checkIn: '2026-10-02', checkOut: '2026-10-05' }),
      booking({ externalId: 'b', checkIn: '2026-10-04', checkOut: '2026-10-07' }),
    ]);
    await ctx.sync.run(adapter);
    adapter.reservations[1] = { ...adapter.reservations[1]!, status: 'CANCELLED' };
    await ctx.sync.run(adapter);
    assert.equal((await ctx.conflicts.find({ from: TODAY })).length, 0);
  });
});

describe('property isolation', () => {
  it('reservations stay with the correct property even when room ids repeat', async () => {
    const a = await carnot();
    const b = await createProperty(ctx.prisma, {
      name: 'Other House',
      externalPropertyId: 'HOTEL-2',
      rooms: { 'ROOM-1': 'Room One' },
    });
    await ctx.sync.run(
      new FakeAdapter([
        booking({ externalId: 'x1', externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1' }),
        booking({ externalId: 'x2', externalPropertyId: 'HOTEL-2', externalUnitId: 'ROOM-1' }),
      ]),
    );
    const x1 = await ctx.prisma.reservation.findFirstOrThrow({ where: { externalId: 'x1' } });
    const x2 = await ctx.prisma.reservation.findFirstOrThrow({ where: { externalId: 'x2' } });
    assert.equal(x1.propertyId, a.property.id);
    assert.equal(x1.unitId, a.units['Quarto Cegonha']);
    assert.equal(x2.propertyId, b.property.id);
    assert.equal(x2.unitId, b.units['Room One']);

    const onlyA = await ctx.reservations.list({ propertyId: a.property.id });
    assert.deepEqual(onlyA.items.map((r) => r.externalId), ['x1']);
  });
});

describe('synchronization records', () => {
  it('a failed fetch is recorded as FAILED with a safe message and an audit entry', async () => {
    await carnot();
    const run = await ctx.sync.run(
      new FakeAdapter([], [], new SourceUnavailableError('Booking could not be reached.')),
    );
    assert.equal(run.status, 'FAILED');
    assert.equal(run.errorMessage, 'Booking could not be reached.');
    assert.ok(run.finishedAt);
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'BOOKING_SYNC_FAILED' } }), 1);
  });

  it('records start and completion in the audit log', async () => {
    await carnot();
    await ctx.sync.run(new FakeAdapter([booking()]));
    const actions = (await ctx.prisma.auditLog.findMany()).map((a) => a.action).sort();
    assert.deepEqual(actions, ['BOOKING_SYNC_COMPLETED', 'BOOKING_SYNC_STARTED', 'RESERVATION_CREATED']);
  });

  it('rejects a second sync while one is running', async () => {
    await carnot();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = new FakeAdapter([booking()]);
    slow.fetchReservations = async () => {
      await gate;
      return { reservations: [booking()], snapshots: [], errors: [] };
    };
    const first = ctx.sync.run(slow);
    await assert.rejects(ctx.sync.run(new FakeAdapter([booking()])), /already running/);
    release();
    await first;
  });
});
