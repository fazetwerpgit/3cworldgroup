import { createHash, randomBytes } from 'crypto';

export function createInviteToken() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashInviteToken(token),
  };
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getInviteExpiration(days = 14) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}
