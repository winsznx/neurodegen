import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of the request-supplied secret against the
 * configured `ADMIN_SECRET` env var. Returns false if either side is missing
 * or if the lengths differ — both cases are exposed via the immediate `!secret`
 * / `!expected` short-circuit before reaching the constant-time path, which
 * is fine because length is not the value being protected.
 *
 * V2 Phase 2 audit fix: previously this used `secret === process.env.ADMIN_SECRET`,
 * which leaks timing information. `crypto.timingSafeEqual` runs in O(N) regardless
 * of where the first mismatched byte occurs.
 */
export function verifyAdminSecret(secret: string | null | undefined): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
