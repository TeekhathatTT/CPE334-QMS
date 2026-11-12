import bcrypt from 'bcrypt';

/**
 * bcrypt cost factor used for every password hash in the system (seed data included).
 * NFR-01: salted adaptive hash.
 */
export const BCRYPT_COST = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

// Hash of a fixed, unusable value. Comparing against it when the email is unknown keeps the
// login timing similar to a wrong-password attempt, so response time does not reveal whether
// an account exists (FR-01).
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('qms-timing-equalizer-not-a-real-password', BCRYPT_COST);
  }
  return dummyHashPromise;
}

/**
 * Verifies a password. Always performs one bcrypt comparison, even when `hash` is null
 * (unknown account), and returns false in that case.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const target = hash ?? (await getDummyHash());
  const matches = await bcrypt.compare(plain, target);
  return hash !== null && matches;
}
