// Creates apps/api/.env and apps/api/.env.test for local development if they
// do not exist yet. Existing files are never overwritten.
//   pnpm setup:env
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const devEnv = join(apiDir, '.env');
if (existsSync(devEnv)) {
  console.log('apps/api/.env already exists, left unchanged');
} else {
  copyFileSync(join(apiDir, '.env.example'), devEnv);
  console.log('Created apps/api/.env from .env.example');
}

// Tests use a separate database, which they WIPE between tests.
const testEnv = join(apiDir, '.env.test');
if (existsSync(testEnv)) {
  console.log('apps/api/.env.test already exists, left unchanged');
} else {
  writeFileSync(
    testEnv,
    [
      'NODE_ENV=test',
      'DATABASE_URL=postgresql://amp:amp@localhost:5433/amp_test?schema=public',
      'APP_TIMEZONE=Europe/Lisbon',
      'BOOKING_INTEGRATION_MODE=mock',
      'DEFAULT_USER_NAME=Test Owner',
      'DEFAULT_USER_EMAIL=test-owner@example.com',
      '',
    ].join('\n'),
  );
  console.log('Created apps/api/.env.test');
}
