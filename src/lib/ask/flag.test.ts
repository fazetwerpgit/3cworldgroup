import { afterEach, describe, expect, it, vi } from 'vitest';
import { askOpenTo, practiceOpenTo } from './flag';

afterEach(() => vi.unstubAllEnvs());

describe('askOpenTo', () => {
  it("lets in owners and the early list while it's 'owners', and nobody else", () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    vi.stubEnv('ASK_3C_ALSO', ' rep-1 , rep-2');
    expect(askOpenTo('owner', 'o1')).toBe(true);
    expect(askOpenTo('entry_rep', 'rep-2')).toBe(true);
    expect(askOpenTo('entry_rep', 'rep-3')).toBe(false);
    expect(askOpenTo('entry_rep', undefined)).toBe(false);
  });

  it('the early list does nothing while it is off', () => {
    vi.stubEnv('ASK_3C_ENABLED', '');
    vi.stubEnv('ASK_3C_ALSO', 'rep-1');
    expect(askOpenTo('entry_rep', 'rep-1')).toBe(false);
  });
});

describe('practiceOpenTo', () => {
  it("is owners only while it's 'owners', even for the Ask early list; everyone once it's on", () => {
    vi.stubEnv('ASK_3C_ENABLED', 'owners');
    vi.stubEnv('ASK_3C_ALSO', 'rep-1');
    expect(practiceOpenTo('owner')).toBe(true);
    expect(practiceOpenTo('entry_rep')).toBe(false);
    vi.stubEnv('ASK_3C_ENABLED', 'true');
    expect(practiceOpenTo('entry_rep')).toBe(true);
    vi.stubEnv('ASK_3C_ENABLED', '');
    expect(practiceOpenTo('owner')).toBe(false);
  });
});
