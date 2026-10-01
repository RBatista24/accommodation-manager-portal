/**
 * Stay dates travel as "YYYY-MM-DD" strings and are handled as calendar
 * dates (no time, no timezone), exactly like the API.
 */
export type IsoDate = string;

function toUtc(d: IsoDate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function todayLocal(): IsoDate {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the week containing d. */
export function startOfWeek(d: IsoDate): IsoDate {
  const dow = toUtc(d).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

export function startOfMonth(d: IsoDate): IsoDate {
  return `${d.slice(0, 7)}-01`;
}

export function addMonths(d: IsoDate, n: number): IsoDate {
  const x = toUtc(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
}

export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => (d: IsoDate) =>
  new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(toUtc(d));

/** 02 Oct */
export const formatShort = fmt({ day: '2-digit', month: 'short' });
/** Thu, 2 Oct 2026 */
export const formatMedium = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** Thursday 2 October 2026 */
export const formatLong = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/** Thu */
export const formatWeekday = fmt({ weekday: 'short' });
/** October 2026 */
export const formatMonth = fmt({ month: 'long', year: 'numeric' });

/** 29 Sep 2026 · 10:32 (local time) for timestamps. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${date} · ${time}`;
}

export function formatStay(checkIn: IsoDate, checkOut: IsoDate): string {
  return `${formatShort(checkIn)} → ${formatShort(checkOut)}`;
}

export function nightsLabel(n: number): string {
  return `${n} night${n === 1 ? '' : 's'}`;
}

export function isoValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = toUtc(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
