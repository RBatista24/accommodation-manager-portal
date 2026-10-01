import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { IcalFeed } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { ReservationSource } from '../../domain/reservation';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MappingsService } from '../mappings/mappings.service';

export interface CreateFeedInput {
  name: string;
  url: string;
  propertyId: string;
  unitId?: string | null;
  /** Advanced: the Booking property (hotel) id. Generated when omitted. */
  externalPropertyId?: string;
  /** Advanced: the Booking room id. Generated when omitted. */
  externalUnitId?: string;
}

export interface UpdateFeedInput {
  name?: string;
  url?: string;
  unitId?: string | null;
  active?: boolean;
}

/**
 * Configuration of iCal feeds. Adding a feed also creates the mapping from
 * that feed's room to a local unit, so one form sets everything up.
 */
@Injectable()
export class IcalFeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mappings: MappingsService,
  ) {}

  async list(source: ReservationSource) {
    const feeds = await this.prisma.icalFeed.findMany({ where: { source }, orderBy: { name: 'asc' } });
    const mappings = await this.prisma.sourceMapping.findMany({
      where: { source },
      include: { property: { select: { name: true } }, unit: { select: { name: true } } },
    });
    const counts = await this.prisma.reservation.groupBy({
      by: ['externalPropertyRef', 'externalUnitRef'],
      where: { source },
      _count: { _all: true },
    });
    return feeds.map((f) => {
      const m = mappings.find(
        (x) => x.externalPropertyId === f.externalPropertyId && x.externalUnitId === f.externalUnitId,
      );
      const reservationCount =
        counts.find((c) => c.externalPropertyRef === f.externalPropertyId && c.externalUnitRef === f.externalUnitId)?._count
          ._all ?? 0;
      return {
        ...presentFeed(f),
        reservationCount,
        mappingId: m?.id ?? null,
        propertyId: m?.propertyId ?? null,
        propertyName: m?.property.name ?? null,
        unitId: m?.unitId ?? null,
        unitName: m?.unit?.name ?? null,
      };
    });
  }

  async create(source: ReservationSource, input: CreateFeedInput, userId: string) {
    const url = validateFeedUrl(input.url);
    const id = randomUUID();
    const externalPropertyId = input.externalPropertyId?.trim() || `ical-property-${input.propertyId}`;
    const externalUnitId = input.externalUnitId?.trim() || `ical-feed-${id}`;

    return this.prisma.$transaction(async (tx) => {
      const feed = await tx.icalFeed.create({
        data: { id, source, name: input.name.trim(), url, externalPropertyId, externalUnitId },
      });
      await this.audit.record(
        {
          action: AuditAction.IcalFeedCreated,
          entityType: 'IcalFeed',
          entityId: feed.id,
          userId,
          metadata: { source, name: feed.name },
        },
        tx,
      );
      const existing = await tx.sourceMapping.findFirst({ where: { source, externalPropertyId, externalUnitId } });
      const mapping = existing
        ? await this.mappings.update(existing.id, { propertyId: input.propertyId, unitId: input.unitId ?? null }, userId, tx)
        : await this.mappings.create(
            {
              source,
              externalPropertyId,
              externalUnitId,
              externalName: feed.name,
              propertyId: input.propertyId,
              unitId: input.unitId ?? null,
            },
            userId,
            tx,
          );
      return { ...presentFeed(feed), mappingId: mapping.id, unitId: mapping.unitId };
    });
  }

  remove(source: ReservationSource, id: string, userId: string) {
    return deleteFeed(this.prisma, this.audit, source, id, userId);
  }

  async update(id: string, input: UpdateFeedInput, userId: string) {
    const current = await this.prisma.icalFeed.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Calendar feed not found');

    return this.prisma.$transaction(async (tx) => {
      const feed = await tx.icalFeed.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.url !== undefined ? { url: validateFeedUrl(input.url), lastError: null } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      await this.audit.record(
        {
          action: AuditAction.IcalFeedUpdated,
          entityType: 'IcalFeed',
          entityId: id,
          userId,
          // Never log the URL itself: it is a secret.
          metadata: {
            changed: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
          },
        },
        tx,
      );
      if (input.unitId !== undefined) {
        const mapping = await tx.sourceMapping.findFirst({
          where: {
            source: feed.source,
            externalPropertyId: feed.externalPropertyId,
            externalUnitId: feed.externalUnitId,
          },
        });
        if (!mapping) throw new BadRequestException('This feed has no mapping; create one on the mapping screen');
        await this.mappings.update(mapping.id, { unitId: input.unitId }, userId, tx);
      }
      return presentFeed(feed);
    });
  }
}

/**
 * Deletes a calendar link together with its room mapping and the reservations
 * it imported, so a wrong link leaves nothing behind. Audited.
 */
export async function deleteFeed(
  prisma: PrismaService,
  audit: AuditService,
  source: ReservationSource,
  id: string,
  userId: string,
) {
  const feed = await prisma.icalFeed.findUnique({ where: { id } });
  if (!feed || feed.source !== source) throw new NotFoundException('Calendar feed not found');

  return prisma.$transaction(async (tx) => {
    const refs = { source: feed.source, externalPropertyRef: feed.externalPropertyId, externalUnitRef: feed.externalUnitId };
    const reservations = await tx.reservation.deleteMany({ where: refs });
    const mappings = await tx.sourceMapping.deleteMany({
      where: { source: feed.source, externalPropertyId: feed.externalPropertyId, externalUnitId: feed.externalUnitId },
    });
    await tx.icalFeed.delete({ where: { id } });
    const deleted = { reservations: reservations.count, mappings: mappings.count };
    await audit.record(
      {
        action: AuditAction.IcalFeedDeleted,
        entityType: 'IcalFeed',
        entityId: id,
        userId,
        // Never the URL: it is a secret.
        metadata: { source: feed.source, name: feed.name, deleted },
      },
      tx,
    );
    return { id, name: feed.name, deleted };
  });
}

function validateFeedUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Enter a valid calendar link (it starts with https://)');
  }
  if (url.protocol !== 'https:') throw new BadRequestException('The calendar link must start with https://');
  return url.toString();
}

/** The URL contains a private token, so only a masked preview ever leaves the server. */
function presentFeed(f: IcalFeed) {
  let urlPreview = '(hidden)';
  try {
    const u = new URL(f.url);
    urlPreview = `${u.protocol}//${u.host}/…${f.url.slice(-4)}`;
  } catch {
    /* keep the placeholder */
  }
  return {
    id: f.id,
    source: f.source,
    name: f.name,
    urlPreview,
    externalPropertyId: f.externalPropertyId,
    externalUnitId: f.externalUnitId,
    active: f.active,
    lastFetchedAt: f.lastFetchedAt?.toISOString() ?? null,
    lastError: f.lastError,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}
