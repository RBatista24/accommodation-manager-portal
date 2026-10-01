/**
 * Environment-based configuration, validated once at startup so a missing or
 * malformed variable fails fast with a clear message instead of at runtime.
 */
export const APP_CONFIG = Symbol('APP_CONFIG');

export type NodeEnv = 'development' | 'test' | 'production';
export type BookingIntegrationMode = 'mock' | 'ical';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  timezone: string;
  corsOrigins: string[];
  bookingMode: BookingIntegrationMode;
  defaultUser: { name: string; email: string };
  /**
   * Address at which this API is reachable from the internet (no trailing slash),
   * used to build the calendar-export links Booking.com fetches.
   * Default: http://localhost:<PORT> (fine for testing, not reachable by Booking).
   */
  publicBaseUrl: string;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const problems: string[] = [];

  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnv;
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    problems.push(`NODE_ENV must be development, test or production (got "${env.NODE_ENV}")`);
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) problems.push('PORT must be a positive integer');

  const databaseUrl = env.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push('DATABASE_URL must be a postgresql:// connection string');

  const timezone = env.APP_TIMEZONE ?? 'Europe/Lisbon';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  } catch {
    problems.push(`APP_TIMEZONE "${timezone}" is not a valid IANA timezone`);
  }

  const bookingMode = (env.BOOKING_INTEGRATION_MODE ?? 'mock') as BookingIntegrationMode;
  if (!['mock', 'ical'].includes(bookingMode)) {
    problems.push(`BOOKING_INTEGRATION_MODE must be "mock" or "ical" (got "${env.BOOKING_INTEGRATION_MODE}")`);
  }
  if (nodeEnv === 'production' && bookingMode === 'mock') {
    problems.push('BOOKING_INTEGRATION_MODE=mock is not allowed in production');
  }

  const corsOrigins = (env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const defaultUser = {
    name: env.DEFAULT_USER_NAME?.trim() || 'Owner',
    email: env.DEFAULT_USER_EMAIL?.trim() || 'owner@example.com',
  };

  const publicBaseUrl = (env.PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+(\/[^\s]*)?$/.test(publicBaseUrl)) {
    problems.push('PUBLIC_BASE_URL must be an http(s) address such as https://calendars.example.com');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return { nodeEnv, port, databaseUrl, timezone, corsOrigins, bookingMode, defaultUser, publicBaseUrl };
}
