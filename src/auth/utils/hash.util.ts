import * as argon2 from 'argon2';
import { createHash } from 'crypto';

export async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
}

export async function verifyPassword(
    hash: string,
    password: string,
): Promise<boolean> {
    return argon2.verify(hash, password);
}

/**
 * Hashes a high-entropy token (refresh token, password reset token) so it can
 * be stored and looked up by equality in a single indexed query.
 *
 * Argon2 is intentionally not used here: these tokens carry 256+ bits of
 * randomness, so brute-forcing the digest is infeasible and a fast hash keeps
 * `refresh` / `logout` / `reset-password` at O(1) instead of O(sessions).
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
