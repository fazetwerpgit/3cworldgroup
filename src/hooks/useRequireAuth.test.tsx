// @vitest-environment jsdom
//
// useRequireAuth: with no session it sends the visitor to sign in at once; role
// and permission redirects wait until the profile on screen is the real read,
// not the copy this device remembered (which may carry a stale role).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User, UserRole } from '@/types';

const replace = vi.fn();
type AuthValue = { user: unknown; loading: boolean; profileVerified: boolean; hasPermission: (permission: string) => boolean };
const auth = vi.hoisted(() => ({
  value: { user: null, loading: false, profileVerified: false, hasPermission: () => false } as AuthValue,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth.value }));

import { useRequireAuth } from './useRequireAuth';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROLES: UserRole[] = ['admin'];

function Gate({ roles, permissions }: { roles?: UserRole[]; permissions?: string[] }) {
  useRequireAuth({ requiredRoles: roles, requiredPermissions: permissions });
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function render(props: { roles?: UserRole[]; permissions?: string[] }) {
  await act(async () => root.render(<Gate {...props} />));
}

beforeEach(() => {
  replace.mockClear();
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
});

const rep = { uid: 'rep-1', fieldRole: 'rep', status: 'active' } as unknown as User;

describe('useRequireAuth', () => {
  it('redirects to sign in at once with no session', async () => {
    auth.value = { user: null, loading: false, profileVerified: false, hasPermission: () => false };
    await render({ roles: ROLES });
    expect(replace).toHaveBeenCalledWith('/portal');
  });

  it('holds role redirects while the remembered profile is unverified', async () => {
    auth.value = { user: rep, loading: false, profileVerified: false, hasPermission: () => false };
    await render({ roles: ROLES });
    expect(replace).not.toHaveBeenCalled();
  });

  it('holds permission redirects while the remembered profile is unverified', async () => {
    auth.value = { user: rep, loading: false, profileVerified: false, hasPermission: () => false };
    await render({ permissions: ['users:write'] });
    expect(replace).not.toHaveBeenCalled();
  });

  it('runs the role redirect once the profile is verified', async () => {
    auth.value = { user: rep, loading: false, profileVerified: false, hasPermission: () => false };
    await render({ roles: ROLES });
    auth.value = { ...auth.value, profileVerified: true };
    await render({ roles: ROLES });
    expect(replace).toHaveBeenCalledWith('/portal/dashboard');
  });

  it('lets a verified user with the role stay', async () => {
    const admin = { uid: 'a-1', role: 'admin', status: 'active' } as unknown as User;
    auth.value = { user: admin, loading: false, profileVerified: true, hasPermission: () => true };
    await render({ roles: ROLES });
    expect(replace).not.toHaveBeenCalled();
  });
});
