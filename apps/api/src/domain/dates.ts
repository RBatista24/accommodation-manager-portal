/**
 * Stay dates are calendar dates ("2026-10-02"), not instants. They are kept as
 * ISO date strings in the domain so timezones can never shift a stay by a day.
 * PostgreSQL stores them as DATE; Prisma hands them over as Date at 00:00 UTC.
 */

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Date (as returned by Prisma for @db.Date) -> "YYYY-MM-DD". */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> Date at 00:00 UTC, suitable for a @db.Date column. */
export function fromIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Whole nights between check-in and check-out. */
export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return Math.round((fromIsoDate(checkOut).getTime() - fromIsoDate(checkIn).getTime()) / 86_400_000);
}

/** Today's calendar date in the given IANA timezone (e.g. "Europe/Lisbon"). */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Standard accommodation semantics: check-in inclusive, check-out exclusive.
 * 02->05 and 05->07 do NOT overlap (one guest leaves the morning the next arrives).
 */
export function staysOverlap(
  a: { checkIn: IsoDate; checkOut: IsoDate },
  b: { checkIn: IsoDate; checkOut: IsoDate },
): boolean {
  // ISO date strings compare correctly as strings.
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}
