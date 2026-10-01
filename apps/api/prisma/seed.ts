/**
 * Development/demo seed. Safe to run any number of times: every record is
 * upserted by a stable key, and existing records are never overwritten (so
 * edits made in the app survive a re-seed).
 *
 *   pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';
import { MOCK_BOOKING_PROPERTY_ID, MOCK_BOOKING_ROOMS } from '../src/integrations/booking/booking-mock.adapter';

const prisma = new PrismaClient();

/** Stable id, so the seed can find Carnot House again even if it was renamed. */
export const CARNOT_HOUSE_ID = 'c0a7b3e1-5d2f-4a6b-9c1e-000000000001';

const CARNOT_HOUSE_UNITS = [
  'Quarto Cegonha',
  'Quarto Flamingo',
  'Quarto Andorinha',
  'Quarto Garça',
  'Quarto Falcão',
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The demo seed must not run in production.');
  }

  const owner = await prisma.user.upsert({
    where: { email: process.env.DEFAULT_USER_EMAIL || 'owner@example.com' },
    update: {},
    create: {
      name: process.env.DEFAULT_USER_NAME || 'Owner',
      email: process.env.DEFAULT_USER_EMAIL || 'owner@example.com',
    },
  });

  const property = await prisma.property.upsert({
    where: { id: CARNOT_HOUSE_ID },
    update: {},
    create: {
      id: CARNOT_HOUSE_ID,
      name: 'Carnot House',
      description: 'Guest house with five rooms.',
      address: null,
    },
  });

  const units = new Map<string, string>();
  for (const name of CARNOT_HOUSE_UNITS) {
    const unit = await prisma.unit.upsert({
      where: { propertyId_name: { propertyId: property.id, name } },
      update: {},
      create: { propertyId: property.id, name },
    });
    units.set(name, unit.id);
  }

  let mappings = 0;
  if ((process.env.BOOKING_INTEGRATION_MODE ?? 'mock') === 'mock') {
    // Demo mode only: link the fictional Booking rooms to the real units.
    // One demo room is deliberately left unmapped to show "pending assignment".
    for (const room of MOCK_BOOKING_ROOMS) {
      await prisma.sourceMapping.upsert({
        where: {
          source_externalPropertyId_externalUnitId: {
            source: 'BOOKING',
            externalPropertyId: MOCK_BOOKING_PROPERTY_ID,
            externalUnitId: room.externalUnitId,
          },
        },
        update: {},
        create: {
          source: 'BOOKING',
          externalPropertyId: MOCK_BOOKING_PROPERTY_ID,
          externalUnitId: room.externalUnitId,
          externalName: `${room.name} (demo)`,
          propertyId: property.id,
          unitId: units.get(room.localUnitName) ?? null,
        },
      });
      mappings++;
    }
  }

  console.log(
    `Seed complete: user "${owner.email}", property "${property.name}", ${units.size} units` +
      (mappings ? `, ${mappings} demo Booking mappings` : ''),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
