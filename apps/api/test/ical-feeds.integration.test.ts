/**
 * Deleting a calendar (iCal) link. Run with: pnpm test:integration
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IcalFeedsService } from '../src/modules/integrations/ical-feeds.service';
import { booking, createProperty, FakeAdapter, makeContext, resetDatabase, type Ctx } from './helpers';

let ctx: Ctx;
let feeds: IcalFeedsService;
let userId: string;

before(async () => {
  ctx = makeContext();
  feeds = new IcalFeedsService(ctx.prisma, ctx.audit, ctx.mappings);
  await ctx.prisma.$connect();
});

after(async () => {
  await ctx.prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(ctx.prisma);
  userId = (await ctx.prisma.user.create({ data: { name: 'Owner', email: 'owner@example.com' } })).id;
});

describe('deleting a calendar link', () => {
  it('removes the link, its mapping and the reservations it imported, and nothing else', async () => {
    const { property, units } = await createProperty(ctx.prisma, {
      name: 'Carnot House',
      externalPropertyId: 'OTHER-HOTEL',
      rooms: { 'OTHER-ROOM': 'Quarto Flamingo' },
    });
    const bad = await feeds.create(
      'BOOKING',
      { name: 'Wrong link', url: 'https://example.test/wrong.ics', propertyId: property.id, unitId: units['Quarto Flamingo'] },
      userId,
    );
    const good = await feeds.create(
      'BOOKING',
      { name: 'Good link', url: 'https://example.test/good.ics', propertyId: property.id, unitId: units['Quarto Flamingo'] },
      userId,
    );
    // One reservation imported through each link, one from another room.
    await ctx.sync.run(
      new FakeAdapter([
        booking({ externalId: 'from-bad', externalPropertyId: bad.externalPropertyId, externalUnitId: bad.externalUnitId }),
        booking({ externalId: 'from-good', externalPropertyId: good.externalPropertyId, externalUnitId: good.externalUnitId, checkIn: '2026-10-10', checkOut: '2026-10-12' }),
        booking({ externalId: 'other', externalPropertyId: 'OTHER-HOTEL', externalUnitId: 'OTHER-ROOM', checkIn: '2026-10-20', checkOut: '2026-10-22' }),
      ]),
    );

    const listed = await feeds.list('BOOKING');
    assert.equal(listed.find((f) => f.id === bad.id)?.reservationCount, 1);

    const result = await feeds.remove('BOOKING', bad.id, userId);

    assert.deepEqual(result.deleted, { reservations: 1, mappings: 1 });
    assert.equal(await ctx.prisma.icalFeed.count(), 1);
    assert.deepEqual((await ctx.prisma.reservation.findMany({ orderBy: { externalId: 'asc' } })).map((r) => r.externalId), ['from-good', 'other']);
    assert.equal(await ctx.prisma.sourceMapping.count(), 2);
    assert.equal(await ctx.prisma.auditLog.count({ where: { action: 'ICAL_FEED_DELETED', entityId: bad.id } }), 1);
  });

  it('answers "not found" for an unknown link', async () => {
    await assert.rejects(feeds.remove('BOOKING', '00000000-0000-4000-8000-000000000000', userId), /not found/i);
  });
});
