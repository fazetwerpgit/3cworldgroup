import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingGate from './OnboardingGate';

const testState = vi.hoisted(() => ({
  auth: {
    user: null as { status?: string; fieldRole?: string } | null,
    loading: false,
  },
  pathname: '/portal/dashboard',
  replace: vi.fn(),
}));

// The project intentionally runs Vitest in a node environment without a DOM.
// Run the gate's effect during the server render so the redirect decision is
// still exercised as a unit, while renderToStaticMarkup checks the no-flash
// output for every non-blocked state.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (effect: () => void) => effect(),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => testState.auth,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => testState.pathname,
  useRouter: () => ({ replace: testState.replace }),
}));

function renderGate() {
  return renderToStaticMarkup(
    <OnboardingGate>
      <span>portal child</span>
    </OnboardingGate>
  );
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    testState.auth = { user: null, loading: false };
    testState.pathname = '/portal/dashboard';
    testState.replace.mockReset();
  });

  it('redirects a pending hire away from the dashboard', () => {
    testState.auth = { user: { status: 'pending', fieldRole: 'entry_level_rep' }, loading: false };

    expect(renderGate()).toBe('');
    expect(testState.replace).toHaveBeenCalledWith('/portal/onboarding');
  });

  it.each([
    ['a pending hire on chat', { status: 'pending', fieldRole: 'entry_level_rep' }, '/portal/chat', false],
    ['a pending hire on onboarding', { status: 'pending', fieldRole: 'l1_manager' }, '/portal/onboarding', false],
    ['an active rep on the dashboard', { status: 'active', fieldRole: 'entry_rep' }, '/portal/dashboard', false],
    ['an admin on admin users', { status: 'active', fieldRole: undefined }, '/portal/admin/users', false],
    ['a loading auth state', { status: 'pending', fieldRole: 'entry_level_rep' }, '/portal/dashboard', true],
    ['a signed-out visitor', null, '/portal/dashboard', false],
  ])('%s sees children without redirect', (_label, user, pathname, loading) => {
    testState.auth = { user, loading };
    testState.pathname = pathname;

    expect(renderGate()).toContain('portal child');
    expect(testState.replace).not.toHaveBeenCalled();
  });
});
