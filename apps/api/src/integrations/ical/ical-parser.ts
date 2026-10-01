import type { IsoDate } from '../../domain/dates';
import { addDays, isIsoDate } from '../../domain/dates';

/**
 * Minimal RFC 5545 reader for reservation calendars. It only understands what
 * accommodation feeds use (all-day VEVENTs with UID/SUMMARY/DTSTART/DTEND),
 * which keeps it small and free of dependencies.
 */
export interface IcalEvent {
  uid: string | null;
  summary: string | null;
  description: string | null;
  start: IsoDate;
  /** Exclusive end date, as in iCal all-day events. */
  end: IsoDate;
  status: string | null;
}

export interface IcalParseResult {
  events: IcalEvent[];
  /** Events that could not be read, with the reason. */
  skipped: { uid: string | null; reason: string }[];
  isCalendar: boolean;
}

interface ContentLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

export function parseIcal(text: string): IcalParseResult {
  const lines = unfold(text);
  const result: IcalParseResult = { events: [], skipped: [], isCalendar: false };
  let current: ContentLine[] | null = null;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const line = parseContentLine(raw);
    if (!line) continue;

    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VCALENDAR') result.isCalendar = true;
    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VEVENT') {
      current = [];
      continue;
    }
    if (line.name === 'END' && line.value.toUpperCase() === 'VEVENT') {
      if (current) {
        const parsed = toEvent(current);
        if ('event' in parsed) result.events.push(parsed.event);
        else result.skipped.push({ uid: parsed.uid, reason: parsed.reason });
      }
      current = null;
      continue;
    }
    current?.push(line);
  }
  return result;
}

/** Long lines are folded onto continuation lines starting with a space or tab. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseContentLine(line: string): ContentLine | null {
  // The value starts at the first ':' that is not inside a quoted parameter.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;

  const [name, ...paramParts] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name!.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch)).trim();
}

/** 20261002 or 20261002T140000Z -> 2026-10-02 (the calendar date as written). */
function toIsoDateValue(value: string): IsoDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isIsoDate(iso) ? iso : null;
}

function toEvent(lines: ContentLine[]): { event: IcalEvent } | { uid: string | null; reason: string } {
  const get = (name: string) => lines.find((l) => l.name === name);
  const uid = get('UID')?.value.trim() || null;
  const startLine = get('DTSTART');
  if (!startLine) return { uid, reason: 'Event has no start date' };
  const start = toIsoDateValue(startLine.value);
  if (!start) return { uid, reason: 'Event has an unreadable start date' };

  const endLine = get('DTEND');
  let end: IsoDate | null = endLine ? toIsoDateValue(endLine.value) : null;
  if (endLine && !end) return { uid, reason: 'Event has an unreadable end date' };
  // RFC 5545: an all-day event without DTEND lasts one day.
  if (!end) end = addDays(start, 1);
  if (end <= start) return { uid, reason: 'Event ends before it starts' };

  const summary = get('SUMMARY');
  const description = get('DESCRIPTION');
  const status = get('STATUS');
  return {
    event: {
      uid,
      summary: summary ? unescapeText(summary.value) || null : null,
      description: description ? unescapeText(description.value) || null : null,
      start,
      end,
      status: status ? status.value.trim().toUpperCase() : null,
    },
  };
}
