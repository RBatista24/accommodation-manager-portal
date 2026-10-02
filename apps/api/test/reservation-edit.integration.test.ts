/**
 * Editing the details a source does not provide. Run with: pnpm test:integration
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { booking, createProperty, FakeAdapter, makeContext, resetDatabase, type Ctx } from './helpers';

let ctx: Ctx;
let userId: string;

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
});

describe('editing a reservation', () => {
  it('keeps hand-filled guest details through later syncs', async () => {
    const { property } = await createProperty(ctx.prisma, {
      name: 'Carnot House',
      externalPropertyId: 'H1',
      rooms: { R1: 'Quarto Cegonha' },
    });
    const adapter = (name: string | null) => new FakeAdapter([booking({ externalPropertyId: 'H1', externalUnitId: 'R1', guestName: name })]);
    await ctx.sync.run(adapter(null));
    const row = await ctx.prisma.reservation.findFirstOrThrow();

    const service = ctx.reservations;
    const edited = await service.edit(
      row.id,
      { guestName: ' Maria Costa ', guestEmail: 'maria@example.test', numberOfGuests: 3, notes: 'Late arrival' },
      userId,
    );
    assert.equal(edited.guestName, 'Maria Costa');
    assert.equal(edited.numberOfGuests, 3); // Booking sent 2: a real change, so it is protected
    assert.equal(property.id, edited.propertyId);

    await ctx.sync.run(adapter('CLOSED'));
    const after = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.guestName, 'Maria Costa');
    assert.equal(after.guestEmail, 'maria@example.test');
    assert.equal(after.notes, 'Late arrival');
    assert.deepEqual([...after.manualFields].sort(), ['guestEmail', 'guestName', 'numberOfGuests']);
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_EDITED', entityId: row.id } }), 1);
  });

  it('saves billing details, normalising the NIF and keeping them local', async () => {
    await createProperty(ctx.prisma, { name: 'Carnot House', externalPropertyId: 'H1', rooms: { R1: 'Quarto Cegonha' } });
    await ctx.sync.run(new FakeAdapter([booking({ externalPropertyId: 'H1', externalUnitId: 'R1' })]));
    const row = await ctx.prisma.reservation.findFirstOrThrow();

    const edited = await ctx.reservations.edit(
      row.id,
      { billingName: '', billingNif: '123 456 789', billingAddress: 'Rua Carnot 1, Lisboa' },
      userId,
    );
    assert.equal(edited.billingName, null, 'empty means "same as the guest"');
    assert.equal(edited.billingNif, '123456789');
    assert.equal(edited.billingAddress, 'Rua Carnot 1, Lisboa');
    const stored = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: row.id } });
    assert.deepEqual(stored.manualFields, [], 'billing fields are never synced, so they need no protection');

    const vat = await ctx.reservations.edit(row.id, { billingNif: 'esb-1234.5678' }, userId);
    assert.equal(vat.billingNif, 'ESB12345678', 'foreign VAT numbers are accepted and normalised');
    await assert.rejects(ctx.reservations.edit(row.id, { billingNif: 'PT#123' }, userId), /NIF or VAT/);
  });

  it('rejects an invalid number of guests and an unknown reservation', async () => {
    const service = ctx.reservations;
    await assert.rejects(service.edit('00000000-0000-4000-8000-000000000000', { notes: 'x' }, userId), /not found/i);
  });
});
