import { describe, expect, it } from 'vitest';
import { canSeeDemoSandbox, isSandboxStaff } from './sandboxStaff';

describe('demo sandbox visibility', () => {
  it('recognizes Jacob by uid or by email (any case, trimmed)', () => {
    expect(isSandboxStaff('bQWKezQmd1P9Yf3GzOdXXBkDzj93')).toBe(true);
    expect(isSandboxStaff('other', ' JMyers@3CWorldGroup.com ')).toBe(true);
    expect(isSandboxStaff('jeremy', 'jeremy@3cworldgroup.com')).toBe(false);
    expect(isSandboxStaff(undefined, undefined)).toBe(false);
  });

  it('lets demo accounts and Jacob see it, and nobody else', () => {
    expect(canSeeDemoSandbox({ uid: 'demo-1', demoAccount: true })).toBe(true);
    expect(canSeeDemoSandbox({ uid: 'bQWKezQmd1P9Yf3GzOdXXBkDzj93' })).toBe(true);
    expect(canSeeDemoSandbox({ uid: 'owner-2', email: 'owner2@3cworldgroup.com', demoAccount: false })).toBe(false);
  });
});
