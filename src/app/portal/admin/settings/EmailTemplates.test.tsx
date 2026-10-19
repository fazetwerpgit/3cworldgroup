// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => {
  const auth = { user: { uid: 'admin-1', role: 'admin' } };
  return { useAuth: () => auth };
});
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

import { EmailTemplates, relativeUpdated } from './EmailTemplates';

describe('relativeUpdated (Chicago calendar days)', () => {
  // 9:00 AM CDT Oct 19 2026.
  const now = new Date('2026-10-19T14:00:00Z');

  it('says yesterday for an 8 PM edit viewed at 9 AM (13h old)', () => {
    expect(relativeUpdated('2026-10-19T01:00:00Z', now)).toBe('updated yesterday');
  });

  it('shows the date for 11 PM two days ago viewed at 8 AM (33h old)', () => {
    const eightAm = new Date('2026-10-19T13:00:00Z');
    expect(relativeUpdated('2026-10-18T04:00:00Z', eightAm)).toBe('updated Oct 17');
  });

  it('says today for an edit earlier the same Chicago day', () => {
    expect(relativeUpdated('2026-10-19T05:30:00Z', now)).toBe('updated today');
  });

  it('dates by the Chicago day, not UTC (11:30 PM CT Oct 16 = 04:30Z Oct 17)', () => {
    expect(relativeUpdated('2026-10-17T04:30:00Z', now)).toBe('updated Oct 16');
  });

  it('handles missing or bad timestamps', () => {
    expect(relativeUpdated(null, now)).toBe('never updated');
    expect(relativeUpdated('nope', now)).toBe('never updated');
  });
});

describe('success flash', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    const templates = ['a', 'b'].map((id) => ({
      id,
      name: `Template ${id.toUpperCase()}`,
      category: 'general',
      subject: 'Hi',
      body: 'Body',
      createdByName: 'Admin',
      updatedAt: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ templates, success: true }) }))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<EmailTemplates />);
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const click = async (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    await act(async () => {
      (el as HTMLElement).click();
    });
  };

  const deleteTemplate = async (name: string) => {
    await click(container.querySelector(`button[aria-label="Delete ${name}"]`));
    const strip = container.querySelector('[role="alertdialog"]');
    await click([...(strip?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Delete'));
  };

  it('a second flash keeps its full 3s; the first timer cannot clear it early', async () => {
    await deleteTemplate('Template A');
    expect(container.textContent).toContain('Template deleted');

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    await deleteTemplate('Template B');

    // First timer's 3s is up here; the second message must still be showing.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(container.textContent).toContain('Template deleted');

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(container.textContent).not.toContain('Template deleted');
  });
});
