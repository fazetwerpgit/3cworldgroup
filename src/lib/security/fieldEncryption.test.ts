import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

// A fixed 32-byte key for tests, set before the module reads it.
beforeAll(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('fieldEncryption', () => {
  it('round-trips: decrypt(encrypt(x)) === x', async () => {
    const { encryptField, decryptField } = await import('./fieldEncryption');
    const secret = '123456789';
    expect(decryptField(encryptField(secret))).toBe(secret);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const { encryptField } = await import('./fieldEncryption');
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('throws on a tampered payload', async () => {
    const { encryptField, decryptField } = await import('./fieldEncryption');
    const payload = encryptField('secret');
    const parts = payload.split('.');
    // Corrupt the ciphertext segment so the auth tag fails.
    parts[2] = parts[2].slice(0, -2) + (parts[2].slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptField(parts.join('.'))).toThrow();
  });

  it('throws on a malformed payload', async () => {
    const { decryptField } = await import('./fieldEncryption');
    expect(() => decryptField('not-a-valid-payload')).toThrow();
  });

  it('last4 returns the last 4 of a stripped value', async () => {
    const { last4 } = await import('./fieldEncryption');
    expect(last4('123-45-6789')).toBe('6789');
    expect(last4('D1234567')).toBe('4567');
  });

  it('throws when the key is missing', async () => {
    const { encryptField } = await import('./fieldEncryption');
    const saved = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    try {
      expect(() => encryptField('x')).toThrow();
    } finally {
      process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = saved;
    }
  });

  it('throws when the key is the wrong length', async () => {
    const { encryptField } = await import('./fieldEncryption');
    const saved = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    try {
      expect(() => encryptField('x')).toThrow();
    } finally {
      process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = saved;
    }
  });
});
