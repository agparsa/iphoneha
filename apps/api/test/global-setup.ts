import { execSync } from 'node:child_process';
import { loadRootEnv } from '../prisma/seed-env';

/**
 * Prepares the integration-test database once per run:
 * applies migrations and seeds the reference catalogue.
 */
export default async function globalSetup(): Promise<void> {
  loadRootEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is required to run the integration tests');
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';

  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  execSync('npx tsx prisma/seed.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, STORAGE_LOCAL_DIR: './storage-test' },
  });
}
