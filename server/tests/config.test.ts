import { describe, it, expect } from 'vitest';
import { getDatabaseUrl } from '../src/db';
import { validateEnv } from '../src/config';

const DEV_URL = 'postgresql://postgres:postgres@localhost:5432/qms_db?schema=public';
const TEST_URL = 'postgresql://postgres:postgres@localhost:5432/qms_test_db?schema=public';
const VALID_SECRET = 'a'.repeat(64);

describe('Database URL resolution (test isolation guard)', () => {
  it('uses TEST_DATABASE_URL when NODE_ENV=test', () => {
    expect(getDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: TEST_URL })).toBe(TEST_URL);
  });

  it('refuses to fall back to DATABASE_URL when TEST_DATABASE_URL is missing in tests', () => {
    expect(() => getDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: DEV_URL })).toThrow(/TEST_DATABASE_URL is required/);
  });

  it('refuses a TEST_DATABASE_URL that points at the development database', () => {
    expect(() =>
      getDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: DEV_URL })
    ).toThrow(/different database/);
  });

  it('requires DATABASE_URL outside tests (no hardcoded default)', () => {
    expect(() => getDatabaseUrl({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL is required/);
    expect(getDatabaseUrl({ NODE_ENV: 'development', DATABASE_URL: DEV_URL })).toBe(DEV_URL);
  });
});

describe('Startup environment validation (SDS §7)', () => {
  it('accepts a complete configuration', () => {
    expect(() => validateEnv({ DATABASE_URL: DEV_URL, SESSION_SECRET: VALID_SECRET, PORT: '3000' })).not.toThrow();
  });

  it('rejects a missing SESSION_SECRET', () => {
    expect(() => validateEnv({ DATABASE_URL: DEV_URL })).toThrow(/SESSION_SECRET is required/);
  });

  it('rejects the .env.example placeholder secret', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: DEV_URL, SESSION_SECRET: 'REPLACE_WITH_SECURE_RANDOM_SECRET_AT_LEAST_32_CHARS' })
    ).toThrow(/placeholder/);
  });

  it('rejects a short SESSION_SECRET', () => {
    expect(() => validateEnv({ DATABASE_URL: DEV_URL, SESSION_SECRET: 'too-short' })).toThrow(/at least 32/);
  });

  it('rejects a missing DATABASE_URL and a non-numeric PORT', () => {
    expect(() => validateEnv({ SESSION_SECRET: VALID_SECRET, PORT: 'abc' })).toThrow(
      /DATABASE_URL is required[\s\S]*PORT must be a number/
    );
  });
});
