import { describe, expect, it } from 'vitest';
import { createDemoRedactor, redactPeople } from './redact';

const rows = [
  { uid: 'a', name: 'Alice Real', photoURL: 'https://img/a.png', sales: 4 },
  { uid: 'me', name: 'Me Myself', photoURL: 'https://img/me.png', sales: 3 },
  { uid: 'b', name: 'Bob Real', avatarUrl: 'https://img/b.png', sales: 2 },
  { uid: '', name: 'No Id', sales: 1 },
];

describe('redactPeople', () => {
  it('a demo caller gets Rep N, opaque ids and no photos for everyone else; its own row as is', () => {
    const redact = createDemoRedactor({ uid: 'me', demoAccount: true });
    const out = redactPeople(rows, redact, { idKey: 'uid', nameKey: 'name' });

    expect(out.map((r) => r.name)).toEqual(['Rep 1', 'Me Myself', 'Rep 2', 'Rep 3']);
    expect(out[1]).toBe(rows[1]);
    expect(out[0].uid).toMatch(/^anon-[0-9a-f]{12}-1$/);
    expect(out[3].uid).toMatch(/^anon-[0-9a-f]{12}-3$/);
    expect(out.map((r) => r.sales)).toEqual([4, 3, 2, 1]);
    expect(out[0]).not.toHaveProperty('photoURL');
    expect(out[2]).not.toHaveProperty('avatarUrl');
    expect(JSON.stringify(out)).not.toMatch(/Alice|Bob|No Id|img\/a|img\/b/);
  });

  it('keeps one alias per person across lists in the same response', () => {
    const redact = createDemoRedactor({ uid: 'me', demoAccount: true });
    const first = redactPeople(rows, redact, { idKey: 'uid', nameKey: 'name' });
    const again = redactPeople([{ uid: 'b', name: 'Bob Real' }], redact, { idKey: 'uid', nameKey: 'name' });
    expect(again[0]).toEqual({ uid: first[2].uid, name: 'Rep 2' });
    expect(redact.name('a', 'Alice Real')).toBe('Rep 1');
    expect(redact.id('me')).toBe('me');
  });

  it('a normal rep gets the rows unchanged', () => {
    const redact = createDemoRedactor({ uid: 'me', demoAccount: false });
    expect(redactPeople(rows, redact, { idKey: 'uid', nameKey: 'name' })).toEqual(rows);
    expect(redact.name('a', 'Alice Real')).toBe('Alice Real');
    expect(redact.id('a')).toBe('a');
  });
});
