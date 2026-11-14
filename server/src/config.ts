/**
 * Startup configuration checks (SDS §7). Fails fast instead of running with
 * missing or placeholder secrets.
 */
export const MIN_SESSION_SECRET_LENGTH = 32;
const PLACEHOLDER_PREFIX = 'REPLACE_WITH';

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];

  if (!env.DATABASE_URL) {
    problems.push('DATABASE_URL is required.');
  }

  const secret = env.SESSION_SECRET;
  if (!secret) {
    problems.push('SESSION_SECRET is required.');
  } else if (secret.startsWith(PLACEHOLDER_PREFIX)) {
    problems.push('SESSION_SECRET still contains the .env.example placeholder; generate a real secret.');
  } else if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`);
  }

  if (env.PORT !== undefined && !/^\d+$/.test(env.PORT)) {
    problems.push('PORT must be a number.');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }
}
