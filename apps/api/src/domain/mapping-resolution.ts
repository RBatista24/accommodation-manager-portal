import type { ReservationSource } from './reservation';

export interface MappingLike {
  source: ReservationSource;
  externalPropertyId: string;
  externalUnitId: string;
  propertyId: string;
  unitId: string | null;
  active: boolean;
}

export interface Assignment {
  propertyId: string | null;
  unitId: string | null;
  /** How the result was obtained, for logs and the UI. */
  resolvedBy: 'unit-mapping' | 'property-mapping' | 'none';
}

/**
 * Resolves an external property/room to a local Property and Unit, using ONLY
 * explicit mappings (never names, never "first free unit").
 *
 * 1. An active mapping for exactly this external room gives property + unit
 *    (unit may be null when the room is known but not linked yet).
 * 2. Otherwise, any active mapping for the same external property gives the
 *    property, and the unit stays unassigned (pending assignment).
 * 3. Otherwise nothing is known: the caller must report it, not guess.
 */
export function resolveAssignment(
  ref: { source: ReservationSource; externalPropertyId: string; externalUnitId: string },
  mappings: readonly MappingLike[],
): Assignment {
  const active = mappings.filter((m) => m.active && m.source === ref.source);

  const exact = active.find(
    (m) => m.externalPropertyId === ref.externalPropertyId && m.externalUnitId === ref.externalUnitId,
  );
  if (exact) return { propertyId: exact.propertyId, unitId: exact.unitId, resolvedBy: 'unit-mapping' };

  const sameProperty = active.filter((m) => m.externalPropertyId === ref.externalPropertyId);
  const propertyIds = new Set(sameProperty.map((m) => m.propertyId));
  // If one external property were mapped to several local properties we cannot
  // tell which one is right, so we do not pick.
  if (propertyIds.size === 1) {
    return { propertyId: sameProperty[0]!.propertyId, unitId: null, resolvedBy: 'property-mapping' };
  }

  return { propertyId: null, unitId: null, resolvedBy: 'none' };
}
