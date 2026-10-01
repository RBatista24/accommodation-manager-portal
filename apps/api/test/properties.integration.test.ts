/**
 * Permanent deletion of a property. Run with: pnpm test:integration
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PropertiesService } from '../src/modules/properties/properties.service';
import { booking, createProperty, FakeAdapter, makeContext, resetDatabase, type Ctx } from './helpers';

let ctx: Ctx;
let properties: PropertiesService;
let userId: string;

before(async () => {
  ctx = makeContext();
  properties = new PropertiesService(ctx.prisma, ctx.audit, ctx.clock);
  await ctx.prisma.$connect();
});

after(async () => {
  await ctx.prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(ctx.prisma);
  userId = (await ctx.prisma.user.create({ data: { name: 'Owner', email: 'owner@example.com' } })).id;
});

describe('deleting a property permanently', () => {
  it('refuses while the property is active', async () => {
    const { property } = await createProperty(ctx.prisma, { name: 'Active House', externalPropertyId: 'H1', rooms: { R1: 'Room 1' } });
    await assert.rejects(properties.remove(property.id, userId), /Deactivate the property/);
    assert.equal(await ctx.prisma.property.count(), 1);
  });

  it('removes the property with its units, reservations, mappings and feeds, and keeps the audit trail', async () => {
    const target = await createProperty(ctx.prisma, { name: 'Old House', externalPropertyId: 'H1', rooms: { R1: 'Room 1', R2: 'Room 2' } });
    const other = await createProperty(ctx.prisma, { name: 'Carnot House', externalPropertyId: 'H2', rooms: { R1: 'Quarto Cegonha' } });
    await ctx.prisma.icalFeed.create({
      data: { source: 'BOOKING', name: 'Room 1', url: 'https://example.test/a.ics', externalPropertyId: 'H1', externalUnitId: 'R1' },
    });
    await ctx.sync.run(
      new FakeAdapter([
        booking({ externalId: 'a', externalPropertyId: 'H1', externalUnitId: 'R1' }),
        booking({ externalId: 'b', externalPropertyId: 'H1', externalUnitId: 'R2' }),
        booking({ externalId: 'c', externalPropertyId: 'H2', externalUnitId: 'R1' }),
      ]),
    );
    await properties.setActive(target.property.id, false, userId);

    const result = await properties.remove(target.property.id, userId);

    assert.deepEqual(result.deleted, { reservations: 2, units: 2, mappings: 2, feeds: 1 });
    assert.equal(await ctx.prisma.property.count({ where: { id: target.property.id } }), 0);
    // The other property is untouched.
    assert.equal(await ctx.prisma.property.count({ where: { id: other.property.id } }), 1);
    assert.equal(await ctx.prisma.reservation.count(), 1);
    assert.equal(await ctx.prisma.unit.count(), 1);
    assert.equal(await ctx.prisma.sourceMapping.count(), 1);
    // Audit history survives, including the deletion itself.
    const deletion = await ctx.prisma.auditLog.findFirst({ where: { action: 'PROPERTY_DELETED' } });
    assert.equal(deletion?.entityId, target.property.id);
    assert.ok((await ctx.prisma.auditLog.count({ where: { action: 'RESERVATION_CREATED' } })) >= 3);
  });

  it('answers "not found" for a property that does not exist', async () => {
    await assert.rejects(properties.remove('00000000-0000-4000-8000-000000000000', userId), /not found/i);
  });
});
