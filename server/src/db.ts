import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

/**
 * Resolves the database connection string.
 *
 * - Test runs (NODE_ENV=test) MUST use TEST_DATABASE_URL, and it must differ from
 *   DATABASE_URL. Test suites truncate tables, so silently falling back to the
 *   development database would destroy its data.
 * - All other environments require DATABASE_URL (SDS §7); there is no built-in default.
 */
export const getDatabaseUrl = (env: NodeJS.ProcessEnv = process.env): string => {
  if (env.NODE_ENV === 'test') {
    const testUrl = env.TEST_DATABASE_URL;
    if (!testUrl) {
      throw new Error(
        'TEST_DATABASE_URL is required when NODE_ENV=test. Refusing to run tests against the development database.'
      );
    }
    if (env.DATABASE_URL && testUrl === env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL must point to a different database than DATABASE_URL.');
    }
    return testUrl;
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to server/.env and configure it.');
  }
  return env.DATABASE_URL;
};

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
    },
  },
});
