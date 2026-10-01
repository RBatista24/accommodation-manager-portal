import { createHash } from 'node:crypto';
import type { NormalizedReservation } from '../../domain/reservation';
import type { SnapshotScope } from '../../domain/snapshot-cancellation';
import { parseIcal, type IcalEvent } from '../ical/ical-parser';
import type {
  AdapterDescription,
  FetchContext,
  FetchResult,
  ReservationSourceAdapter,
} from '../reservation-source-adapter';
import { SourceUnavailableError } from '../reservation-source-adapter';

/**
 * Booking.com via the per-room iCal export links from the extranet.
 *
 * What iCal gives us: stay dates and (usually) a short summary per booking.
 * What it does NOT give: e-mail, phone, number of guests, explicit
 * cancellations. Cancellations are inferred from bookings disappearing from a
 * feed (see snapshot-cancellation.ts).
 */
export interface IcalFeedConfig {
  id: string;
  name: string;
  url: string;
  externalPropertyId: string;
  externalUnitId: string;
}

export interface IcalFeedStore {
  listActiveFeeds(source: 'BOOKING'): Promise<IcalFeedConfig[]>;
  recordFetch(feedId: string, outcome: { ok: true } | { ok: false; error: string }): Promise<void>;
}

export type TextFetcher = (url: string) => Promise<string>;

const GENERIC_SUMMARY = /^(closed|not available|blocked|unavailable|reserved)\b|not available/i;

export class BookingIcalAdapter implements ReservationSourceAdapter {
  readonly source = 'BOOKING' as const;
  readonly mode = 'ical';

  constructor(
    private readonly feeds: IcalFeedStore,
    private readonly fetchText: TextFetcher = defaultFetcher,
  ) {}

  async describe(): Promise<AdapterDescription> {
    const feeds = await this.feeds.listActiveFeeds('BOOKING');
    return {
      configured: feeds.length > 0,
      summary:
        feeds.length > 0
          ? `Reading ${feeds.length} Booking.com calendar feed${feeds.length === 1 ? '' : 's'} (iCal)`
          : 'No Booking.com calendar feeds configured yet',
      details: { feedCount: feeds.length },
    };
  }

  async fetchReservations(context: FetchContext): Promise<FetchResult> {
    const feeds = await this.feeds.listActiveFeeds('BOOKING');
    if (feeds.length === 0) {
      throw new SourceUnavailableError('No Booking.com calendar feeds are configured.');
    }

    const result: FetchResult = { reservations: [], snapshots: [], errors: [] };
    for (const feed of feeds) {
      try {
        const text = await this.fetchText(feed.url);
        const parsed = parseIcal(text);
        if (!parsed.isCalendar) throw new Error('The link did not return a calendar');

        const reservations = parsed.events.map((e) => toNormalized(feed, e));
        result.reservations.push(...reservations);
        for (const s of parsed.skipped) {
          result.errors.push({ scope: feed.name, message: `Skipped one calendar entry: ${s.reason}` });
        }
        const snapshot: SnapshotScope = {
          source: 'BOOKING',
          externalPropertyId: feed.externalPropertyId,
          externalUnitId: feed.externalUnitId,
          coversStaysEndingAfter: context.today,
          presentExternalIds: new Set(reservations.map((r) => r.externalId)),
        };
        result.snapshots.push(snapshot);
        await this.feeds.recordFetch(feed.id, { ok: true });
      } catch (err) {
        // Never include the URL: it contains a private token.
        const message = `Could not read the calendar feed "${feed.name}"`;
        result.errors.push({ scope: feed.name, message });
        await this.feeds.recordFetch(feed.id, { ok: false, error: describeError(err) });
      }
    }

    if (result.snapshots.length === 0) {
      throw new SourceUnavailableError('None of the Booking.com calendar feeds could be read.');
    }
    // Every calendar was readable but none held a single booking: almost always
    // a wrong link or rooms without future bookings. Say so instead of a silent SUCCESS.
    if (result.reservations.length === 0 && result.errors.length === 0) {
      result.errors.push({
        scope: 'calendars',
        message:
          'All calendars were read but contain no bookings. Check that each link is the room\'s "Export your calendar" link and that the room has current or future reservations in Booking.com.',
      });
    }
    return result;
  }
}

function toNormalized(feed: IcalFeedConfig, event: IcalEvent): NormalizedReservation {
  // The same booking can appear in several room feeds (multi-room bookings),
  // so the external id is scoped to the room.
  const baseId = event.uid ?? stableHash(`${feed.id}|${event.start}|${event.end}|${event.summary ?? ''}`);
  const summary = event.summary?.trim() ?? '';
  return {
    source: 'BOOKING',
    externalId: `${feed.externalUnitId}:${baseId}`,
    externalPropertyId: feed.externalPropertyId,
    externalUnitId: feed.externalUnitId,
    externalUnitName: feed.name,
    guestName: summary && !GENERIC_SUMMARY.test(summary) ? summary : null,
    // Not available through iCal: undefined keeps anything we already know.
    guestEmail: undefined,
    guestPhone: undefined,
    numberOfGuests: undefined,
    checkIn: event.start,
    checkOut: event.end,
    status: event.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED',
  };
}

function stableHash(value: string): string {
  return `h-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function describeError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  // Strip anything that looks like a URL before it is stored.
  return text.replace(/https?:\/\/\S+/g, '[url]').slice(0, 500);
}

const MAX_FEED_BYTES = 5 * 1024 * 1024;

async function defaultFetcher(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Feed responded with HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > MAX_FEED_BYTES) throw new Error('Feed is too large');
  const text = await response.text();
  if (text.length > MAX_FEED_BYTES) throw new Error('Feed is too large');
  return text;
}
