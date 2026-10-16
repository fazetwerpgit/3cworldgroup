import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));

import { DELETED_USER_NAME, PERSONAL_PROFILE_FIELDS, anonymizedProfileUpdate } from './accountClosure';

describe('anonymizedProfileUpdate', () => {
  it('removes both the email and the legacy capital-E Email field', () => {
    expect(PERSONAL_PROFILE_FIELDS).toContain('email');
    expect(PERSONAL_PROFILE_FIELDS).toContain('Email');
    const update = anonymizedProfileUpdate('active');
    expect(update.email).toBe('__DELETE__');
    expect(update.Email).toBe('__DELETE__');
  });

  it('removes contact, photo and device fields, and keeps the payroll ids', () => {
    const update = anonymizedProfileUpdate('active', new Date('2026-10-16T00:00:00Z'));
    for (const f of ['phone', 'address', 'city', 'state', 'zip', 'avatarUrl', 'pushTokens', 'nativePushTokens']) {
      expect(update[f]).toBe('__DELETE__');
    }
    for (const kept of ['role', 'fieldRole', 'salesRepId', 'reportsToId', 'territoryId', 'hireDate']) {
      expect(update).not.toHaveProperty(kept);
    }
    expect(update).toMatchObject({ displayName: DELETED_USER_NAME, status: 'inactive', selfDeleted: true, deactivatedFromStatus: 'active' });
  });

  it('does not overwrite where an already-inactive account came from', () => {
    expect(anonymizedProfileUpdate('inactive')).not.toHaveProperty('deactivatedFromStatus');
  });
});
