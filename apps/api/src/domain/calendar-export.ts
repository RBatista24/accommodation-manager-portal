import { addDays, type IsoDate } from './dates';
import type { ReservationKind, ReservationSource, ReservationStatus } from './reservation';

/**
 * The outgoing iCal calendar of one unit, for Booking.com (or another channel)
 * to import so that dates sold or closed elsewhere become unavailable there.
 *
 * Privacy: events carry no guest data — every event is just "Not available".
 */
export interface ExportableStay {
  id: string;
  source: ReservationSource;
  status: ReservationStatus;
  kind: ReservationKind;
  checkIn: IsoDate;
  checkOut: IsoDate;
}

/** How far back stays that already ended are still listed (harmless, helps late refreshes). */
export const EXPORT_PAST_DAYS = 7;

/**
 * What goes into the feed: confirmed stays and blocks of the unit that did not
 * come from Booking itself (Booking already knows its own bookings; echoing
 * them back could make Booking close dates twice or loop), ending after
 * today − EXPORT_PAST_DAYS.
 */
export function selectExportable(stays: readonly ExportableStay[], today: IsoDate): ExportableStay[] {
  const since = addDays(today, -EXPORT_PAST_DAYS);
  return stays
    .filter((s) => s.status === 'CONFIRMED' && s.source !== 'BOOKING' && s.checkOut > since)
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.id < b.id ? -1 : 1));
}

const PRODID = '-//accommodation-manager-portal//Calendar export//EN';

/** RFC 5545 text, CRLF line endings, lines folded at 75 octets. */
export function buildUnitCalendar(opts: {
  calendarName: string;
  stays: readonly ExportableStay[];
  now: Date;
}): string {
  const stamp = opts.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
  ];
  for (const s of opts.stays) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@accommodation-manager-portal`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${s.checkIn.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${s.checkOut.replace(/-/g, '')}`,
      'SUMMARY:Not available',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut a UTF-8 character in half.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines start with a space
  }
  return parts.join('\r\n ');
}
