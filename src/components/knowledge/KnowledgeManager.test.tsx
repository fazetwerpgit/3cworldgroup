// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskLogView } from '@/lib/ask/chat';
import type { PracticeLogView } from '@/lib/ask/practice';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

import { CoachWasWrong, Questions, toggleAudience, tokensByAudience } from './KnowledgeManager';

let container: HTMLDivElement;
let root: Root;

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function question(id: string, text: string, rating: 'up' | 'down' | null = null) {
  return { id, repName: 'Rita Rep', createdAt: null, hadPhoto: false, rating, prevQuestion: '', question: text, answer: 'An answer', draft: '' } as unknown as AskLogView;
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Questions filter', () => {
  it('ignores an older "All" response that lands after the "Thumbs down" one', async () => {
    let finishAll: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('?rating=down')) {
        return Promise.resolve(respond(200, { questions: [question('d1', 'Down question', 'down')] }));
      }
      return new Promise((resolve) => {
        finishAll = resolve;
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<Questions onAddToKnowledge={() => {}} />);
    });
    await act(async () => {
      button('Thumbs down').click();
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Down question'));
    });

    // The first "All" request finishes last, with the full list.
    await act(async () => {
      finishAll(respond(200, { questions: [question('a1', 'All question one'), question('a2', 'All question two')] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('h2')?.textContent).toBe('Thumbs down');
    expect(container.textContent).toContain('Down question');
    expect(container.textContent).not.toContain('All question one');
  });
});

describe('CoachWasWrong', () => {
  it('shows an error when removing a correction fails, with the form closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(500, { error: 'nope' })));
    const onChange = vi.fn();
    const row = {
      id: 'log-1',
      corrections: [{ id: 'c1', part: 'score', original: '6', take: 'It was a 4.' }],
    } as unknown as PracticeLogView;

    await act(async () => {
      root.render(<CoachWasWrong row={row} onChange={onChange} />);
    });
    await act(async () => {
      button('Remove').click();
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe('That did not delete. Try again.'));
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(button('Coach was wrong')).toBeTruthy();
  });
});

describe('note audience chips', () => {
  it('Everyone stands alone, the others combine, and clearing the last goes back to Everyone', () => {
    expect(toggleAudience(['all'], 'solar')).toEqual(['solar']);
    expect(toggleAudience(['solar'], 'manager')).toEqual(['solar', 'manager']);
    expect(toggleAudience(['solar', 'manager'], 'all')).toEqual(['all']);
    expect(toggleAudience(['solar'], 'solar')).toEqual(['all']);
  });

  it('estimates each audience as the Everyone notes plus its own', () => {
    const notes = [
      { title: 'aa', body: 'aaaaaa', audience: ['all' as const] },
      { title: 'ss', body: 'ssssssssssssss', audience: ['solar' as const, 'owner' as const] },
    ];
    expect(tokensByAudience(notes)).toEqual({ all: 2, solar: 6, knock: 2, manager: 2, owner: 6 });
  });
});
