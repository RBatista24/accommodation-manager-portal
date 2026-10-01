/**
 * Reservations created by hand (source DIRECT). Run with: pnpm test:integration
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { booking, createProperty, FakeAdapter, makeContext, resetDatabase, type Ctx } from './helpers';

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

const direct = (over: Record<string, unknown> = {}) => ({
  propertyId,
  unitId: units['Quarto Cegonha']!,
  checkIn: '2026-10-10',
  checkOut: '2026-10-13',
  guestName: 'Maria Costa',
  numberOfGuests: 2,
  ...over,
});

describe('creating a reservation by hand', () => {
  it('stores a DIRECT reservation with no external id, audited with the user', async () => {
    const r = await ctx.reservations.create(direct({ billingNif: 'pt 123 456 789' }), userId);
    assert.equal(r.source, 'DIRECT');
    assert.equal(r.externalId, null);
    assert.equal(r.status, 'CONFIRMED');
    assert.equal(r.unitName, 'Quarto Cegonha');
    assert.equal(r.nights, 3);
    assert.equal(r.billingNif, 'PT123456789');
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'RESERVATION_CREATED', entityId: r.id } });
    assert.equal(log.userId, userId);

    // Several direct reservations may coexist: NULL external ids never collide.
    await ctx.reservations.create(direct({ checkIn: '2026-10-20', checkOut: '2026-10-22' }), userId);
    assert.equal(await ctx.prisma.reservation.count({ where: { source: 'DIRECT' } }), 2);
  });

  it('refuses an overlap with 409 listing the other stay, and saves it once accepted', async () => {
    await ctx.sync.run(new FakeAdapter([booking({ externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1', checkIn: '2026-10-09', checkOut: '2026-10-11' })]));

    await assert.rejects(ctx.reservations.create(direct(), userId), (err: any) => {
      assert.equal(err.getStatus(), 409);
      const body = err.getResponse();
      assert.equal(body.details.conflicts.length, 1);
      assert.equal(body.details.conflicts[0].checkIn, '2026-10-09');
      return true;
    });
    assert.equal(await ctx.prisma.reservation.count({ where: { source: 'DIRECT' } }), 0);

    const r = await ctx.reservations.create(direct({ acceptConflicts: true }), userId);
    assert.equal(r.conflicts.length, 1, 'the accepted conflict stays visible');
  });

  it('allows a stay that starts the day another ends (check-out exclusive)', async () => {
    await ctx.reservations.create(direct(), userId);
    await ctx.reservations.create(direct({ checkIn: '2026-10-13', checkOut: '2026-10-15' }), userId);
  });

  it('rejects invalid input', async () => {
    await assert.rejects(ctx.reservations.create(direct({ checkOut: '2026-10-10' }), userId), /after check-in/);
    await assert.rejects(ctx.reservations.create(direct({ guestName: '  ' }), userId), /guest name/);
    const other = await ctx.prisma.property.create({ data: { name: 'Other' } });
    await assert.rejects(ctx.reservations.create(direct({ propertyId: other.id }), userId), /unit of this property/);
    await ctx.prisma.unit.update({ where: { id: units['Quarto Cegonha']! }, data: { active: false } });
    await assert.rejects(ctx.reservations.create(direct(), userId), /deactivated/);
  });

  it('is never touched by a Booking sync', async () => {
    const r = await ctx.reservations.create(direct(), userId);
    // A Booking snapshot of the same room that does not list the direct stay must not cancel it.
    await ctx.sync.run(
      new FakeAdapter(
        [booking({ externalId: '999', externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1', checkIn: '2026-11-01', checkOut: '2026-11-03' })],
        [{ source: 'BOOKING', externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1', coversStaysEndingAfter: '2026-10-01', presentExternalIds: new Set(['999']) }],
      ),
    );
    const after = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(after.status, 'CONFIRMED');
    assert.equal(after.guestName, 'Maria Costa');
  });
});

describe('changing and cancelling a direct reservation', () => {
  it('moves dates and unit, checking overlaps against the new unit', async () => {
    const a = await ctx.reservations.create(direct(), userId);
    await ctx.reservations.create(direct({ unitId: units['Quarto Flamingo']!, checkIn: '2026-10-11', checkOut: '2026-10-12' }), userId);

    await assert.rejects(ctx.reservations.edit(a.id, { unitId: units['Quarto Flamingo']! }, userId), (e: any) => e.getStatus() === 409);
    const moved = await ctx.reservations.edit(a.id, { checkIn: '2026-10-12', checkOut: '2026-10-14', unitId: units['Quarto Flamingo']! }, userId);
    assert.equal(moved.checkIn, '2026-10-12');
    assert.equal(moved.unitName, 'Quarto Flamingo');
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'RESERVATION_UPDATED', entityId: a.id } });
    assert.deepEqual((log.metadata as any).after, { checkIn: '2026-10-12', checkOut: '2026-10-14', unitId: units['Quarto Flamingo'] });
  });

  it('cancels without deleting, and refuses to change a cancelled stay', async () => {
    const a = await ctx.reservations.create(direct(), userId);
    const cancelled = await ctx.reservations.cancel(a.id, userId);
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(await ctx.prisma.reservation.count(), 1);
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_CANCELLED', entityId: a.id } }), 1);
    await assert.rejects(ctx.reservations.edit(a.id, { checkOut: '2026-10-14' }, userId), /cancelled/);
    // Cancelling twice is harmless.
    await ctx.reservations.cancel(a.id, userId);
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_CANCELLED', entityId: a.id } }), 1);
  });

  it('keeps imported reservations under the control of their source', async () => {
    await ctx.sync.run(new FakeAdapter([booking({ externalPropertyId: 'HOTEL-1', externalUnitId: 'ROOM-1' })]));
    const imported = await ctx.prisma.reservation.findFirstOrThrow({ where: { source: 'BOOKING' } });
    await assert.rejects(ctx.reservations.edit(imported.id, { checkOut: '2026-10-09' }, userId), /come from its source/);
    await assert.rejects(ctx.reservations.cancel(imported.id, userId), /cancelled at their source/);
    // Details are still editable.
    const edited = await ctx.reservations.edit(imported.id, { notes: 'Late arrival' }, userId);
    assert.equal(edited.notes, 'Late arrival');
  });
});
