import { describe, expect, it } from 'vitest';
import { isAwaitingRoleAssignment } from './pendingApproval';

describe('isAwaitingRoleAssignment', () => {
  it('matches pending signups that do not have an assigned field role', () => {
    expect(isAwaitingRoleAssignment({ status: 'pending' })).toBe(true);
  });

  it('does not match pending users that are already assigned a field role', () => {
    expect(isAwaitingRoleAssignment({ status: 'pending', fieldRole: 'entry_rep' })).toBe(false);
  });

  it('does not match active or inactive users', () => {
    expect(isAwaitingRoleAssignment({ status: 'active', fieldRole: 'entry_rep' })).toBe(false);
    expect(isAwaitingRoleAssignment({ status: 'inactive' })).toBe(false);
  });
});
