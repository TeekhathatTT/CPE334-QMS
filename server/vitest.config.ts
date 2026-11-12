import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    // Every suite resets and re-seeds the shared test database, so test files must
    // run one at a time; parallel files would delete each other's fixtures.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
    },
  },
});
