/**
 * Blocked dates and the outgoing calendar link for Booking. Run with: pnpm test:integration
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { booking, createProperty, FakeAdapter, makeContext, resetDatabase, TODAY, type Ctx } from './helpers';

let ctx: Ctx;
let userId: string;
let propertyId: string;
let units: Record<string, string>;

before(async () => {
  ctx = makeContext();
  await ctx.prisma.$connect();
});
after(async () => {
  await ctx.prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(ctx.prisma);
  userId = (await ctx.prisma.user.create({ data: { name: 'Owner', email: 'owner@example.com' } })).id;
  const created = await createProperty(ctx.prisma, {
    name: 'Carnot House',
    externalPropertyId: 'HOTEL-1',
    rooms: { 'ROOM-1': 'Quarto Cegonha', 'ROOM-2': 'Quarto Flamingo' },
  });
  propertyId = created.property.id;
  units = created.units;
});

const cegonha = () => units['Quarto Cegonha']!;

describe('blocked dates', () => {
  it('can be created without a guest, keeping only the reason', async () => {
    const b = await ctx.reservations.create(
      { propertyId, unitId: cegonha(), checkIn: '2026-10-05', checkOut: '2026-10-08', kind: 'BLOCK', notes: 'Painting', guestName: 'ignored', billingNif: '123456789' },
      userId,
    );
    assert.equal(b.kind, 'BLOCK');
    assert.equal(b.source, 'DIRECT');
    assert.equal(b.guestName, null);
    assert.equal(b.billingNif, null);
    assert.equal(b.notes, 'Painting');
  });

  it('still conflict with a guest stay in the same unit', async () => {
    await ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: '2026-10-05', checkOut: '2026-10-08', kind: 'BLOCK' }, userId);
    await assert.rejects(
      ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: '2026-10-07', checkOut: '2026-10-09', guestName: 'Maria' }, userId),
      (e: any) => e.getStatus() === 409,
    );
  });

  it('an imported Booking closure can be marked as a block, and sync never undoes it', async () => {
    const closure = booking({ externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1', guestName: null, checkIn: '2026-12-24', checkOut: '2026-12-26' });
    await ctx.sync.run(new FakeAdapter([closure]));
    const imported = await ctx.prisma.reservation.findFirstOrThrow({ where: { source: 'BOOKING' } });
    assert.equal(imported.kind, 'STAY');

    const marked = await ctx.reservations.setKind(imported.id, 'BLOCK', userId);
    assert.equal(marked.kind, 'BLOCK');
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_KIND_CHANGED', entityId: imported.id } }), 1);

    await ctx.sync.run(new FakeAdapter([{ ...closure, checkOut: '2026-12-27' }]));
    const after = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: imported.id } });
    assert.equal(after.kind, 'BLOCK', 'sync keeps the kind');
    assert.equal(after.checkOut.toISOString().slice(0, 10), '2026-12-27', 'but dates still follow Booking');
  });

  it('a direct block cannot become a guest stay without a guest name', async () => {
    const b = await ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: '2026-10-05', checkOut: '2026-10-08', kind: 'BLOCK' }, userId);
    await assert.rejects(ctx.reservations.setKind(b.id, 'STAY', userId), /guest name/);
    await ctx.reservations.edit(b.id, { guestName: 'Maria' }, userId);
    assert.equal((await ctx.reservations.setKind(b.id, 'STAY', userId)).kind, 'STAY');
  });

  it('are left out of guest lists but make the unit unavailable on the dashboard', async () => {
    await ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: TODAY, checkOut: '2026-10-04', kind: 'BLOCK' }, userId);
    await ctx.reservations.create({ propertyId, unitId: units['Quarto Flamingo']!, checkIn: TODAY, checkOut: '2026-10-03', guestName: 'Maria' }, userId);
    const d = await ctx.dashboard.get();
    assert.deepEqual(d.today.checkIns.map((r) => r.guestName), ['Maria']);
    assert.equal(d.occupancy.occupiedUnits, 1);
    assert.equal(d.occupancy.blockedUnits, 1);
    assert.equal(d.occupancy.availableUnits, 0);
    assert.equal(d.occupancy.units.find((u) => u.id === cegonha())!.blocked, true);

    const list = await ctx.reservations.list({ kind: 'BLOCK' });
    assert.equal(list.total, 1);
  });
});

describe('calendar export for Booking', () => {
  it('publishes direct stays and blocks of one unit, without guest data or Booking’s own bookings', async () => {
    await ctx.sync.run(new FakeAdapter([booking({ externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1', checkIn: '2026-10-20', checkOut: '2026-10-22' })]));
    await ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: '2026-10-05', checkOut: '2026-10-08', guestName: 'Maria Secret' }, userId);
    await ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: '2026-10-10', checkOut: '2026-10-11', kind: 'BLOCK', notes: 'Painting' }, userId);
    const cancelled = await ctx.reservations.create({ propertyId, unitId: cegonha(), checkIn: '2026-10-12', checkOut: '2026-10-13', guestName: 'Gone' }, userId);
    await ctx.reservations.cancel(cancelled.id, userId);
    await ctx.reservations.create({ propertyId, unitId: units['Quarto Flamingo']!, checkIn: '2026-10-05', checkOut: '2026-10-06', guestName: 'Other unit' }, userId);

    const link = await ctx.exports.enable(cegonha(), userId);
    assert.match(link.url!, /^https:\/\/calendars\.example\.test\/api\/calendar-export\/[A-Za-z0-9_-]{40,}\.ics$/);
    const token = link.url!.split('/').pop()!.replace(/\.ics$/, '');

    const ics = await ctx.exports.render(token);
    assert.deepEqual([...ics.matchAll(/DTSTART;VALUE=DATE:(\d+)/g)].map((m) => m[1]), ['20261005', '20261010']);
    assert.equal(/Maria|Painting|Gone|Other unit/.test(ics), false, 'no guest data or notes');

    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'CALENDAR_EXPORT_ENABLED' } });
    assert.equal(JSON.stringify(audit.metadata).includes(token), false, 'the token never reaches the audit log');
  });

  it('a new link replaces the old one, and a disabled link answers 404', async () => {
    const first = await ctx.exports.enable(cegonha(), userId);
    const second = await ctx.exports.enable(cegonha(), userId);
    const tokenOf = (u: string) => u.split('/').pop()!.replace(/\.ics$/, '');
    await assert.rejects(ctx.exports.render(tokenOf(first.url!)), (e: any) => e.getStatus() === 404);
    await ctx.exports.render(tokenOf(second.url!));
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'CALENDAR_EXPORT_ROTATED' } }), 1);

    await ctx.exports.disable(cegonha(), userId);
    await assert.rejects(ctx.exports.render(tokenOf(second.url!)), (e: any) => e.getStatus() === 404);
    await assert.rejects(ctx.exports.render('not-a-token'), (e: any) => e.getStatus() === 404);

    const listed = await ctx.exports.list();
    assert.deepEqual(listed.map((l) => [l.unitName, l.enabled]), [['Quarto Cegonha', false], ['Quarto Flamingo', false]]);
  });
});
