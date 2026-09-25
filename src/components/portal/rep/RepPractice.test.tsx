// @vitest-environment jsdom
//
// Ask 3C Practice on the rep page: pick, knock, pitch, the door closes, the
// feedback shows, practice again. With no speech APIs it is plain typing; with
// them the homeowner is read aloud and a dictated line sends itself.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRACTICE_SESSION_KEY } from '@/lib/ask/practice';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

import { RepPractice } from './RepPractice';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

function replies(...bodies: unknown[]) {
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    );
  }
}

const sent = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string);
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const text = () => container.textContent ?? '';

async function click(label: string) {
  const target = button(label);
  if (!target) throw new Error(`no button "${label}"`);
  await act(async () => target.click());
}

async function type(value: string) {
  const box = container.querySelector('textarea') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function render() {
  await act(async () => root.render(<RepPractice uid="r1" active onResume={() => {}} />));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  Element.prototype.scrollIntoView = () => {};
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('RepPractice', () => {
  it('runs a typed practice from the knock to the feedback, then starts over', async () => {
    await render();
    // Without speech APIs there's no Talk toggle, and nothing to knock on until a homeowner is picked.
    expect(button('Talk')).toBeUndefined();
    expect(button('Knock')?.disabled).toBe(true);
    await click('Price shopper');
    replies({ reply: '(opens the door) Yeah?', ended: false });
    await click('Knock');
    expect(sent(0)).toMatchObject({ action: 'turn', persona: 'price-shopper', history: [] });
    expect(text()).toContain('Homeowner(opens the door) Yeah?');
    expect(button('Leave')).toBeDefined();
    expect(container.querySelector('textarea')).not.toBeNull();

    replies(
      { reply: 'Deal, Thursday works.', ended: true },
      { id: 'p1', feedback: 'Score: 8/10\nResult: sale', score: 8 }
    );
    await type('Hi, I am with 3C.');
    await click('Send');
    // [END] arrived: the feedback is asked for on its own.
    expect(sent(1).history).toEqual([
      { role: 'customer', text: '(opens the door) Yeah?' },
      { role: 'rep', text: 'Hi, I am with 3C.' },
    ]);
    expect(sent(2)).toMatchObject({ action: 'feedback', persona: 'price-shopper', seed: sent(0).seed, endedBy: 'homeowner' });
    expect(sent(2).history).toHaveLength(3);
    expect(text()).toContain('Session over');
    expect(text()).toContain('8/10');
    expect(text()).toContain('You were talking to: Price shopper');
    expect(container.querySelector('textarea')).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(PRACTICE_SESSION_KEY)!).feedback.score).toBe(8);

    await click('Practice again');
    expect(button('Knock')?.disabled).toBe(true);
    expect(window.sessionStorage.getItem(PRACTICE_SESSION_KEY)).toBeNull();
  });

  it('puts a line that got no answer back in the composer', async () => {
    await render();
    await click('Renter');
    replies({ reply: 'Hi?', ended: false });
    await click('Knock');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'The homeowner took too long.' }), { status: 504 }));
    await type('Do you pay for internet yourself?');
    await click('Send');
    expect(text()).toContain('The homeowner took too long.');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Do you pay for internet yourself?');
    expect(text()).not.toContain('Do you pay for internet yourself?Homeowner');
  });

  it('with Talk on: unlocks speech on the knock, reads the homeowner aloud, and sends a dictated line', async () => {
    const spoken: { text: string; volume: number }[] = [];
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        voice: unknown = null;
        pitch = 1;
        rate = 1;
        volume = 1;
        constructor(public text: string) {}
      }
    );
    Object.assign(window, {
      speechSynthesis: {
        speak: (u: { text: string; volume: number }) => spoken.push({ text: u.text, volume: u.volume }),
        cancel: vi.fn(),
        getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
      },
    });
    let recognition: {
      onresult: (event: unknown) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
      lang: string;
    } | null = null;
    Object.assign(window, {
      webkitSpeechRecognition: class {
        lang = '';
        onresult = () => {};
        onerror = () => {};
        onend = () => {};
        constructor() {
          recognition = this as never;
        }
        start() {}
        stop() {
          this.onend();
        }
        abort() {
          this.onend();
        }
      },
    });

    await render();
    expect(button('Talk on')?.getAttribute('aria-pressed')).toBe('true');
    await click('Elderly homeowner');
    replies({ reply: '(opens the door) Hello, dear?', ended: false });
    await click('Knock');
    expect(spoken[0]).toEqual({ text: ' ', volume: 0 });
    expect(spoken[1]).toEqual({ text: 'Hello, dear?', volume: 1 });

    await click('Tap to talk');
    expect(recognition!.lang).toBe('en-US');
    await act(async () =>
      recognition!.onresult({ results: [[{ transcript: 'Hi, I am with' }], [{ transcript: ' 3C.' }]] })
    );
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Hi, I am with 3C.');
    replies({ reply: 'Oh?', ended: false });
    await click('Listening');
    expect(sent(1).history.at(-1)).toEqual({ role: 'rep', text: 'Hi, I am with 3C.' });
    expect(spoken.at(-1)?.text).toBe('Oh?');

    // Nothing heard: nothing sent, and a note to try again.
    await click('Tap to talk');
    await click('Listening');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(text()).toContain("Didn't catch that — tap to try again.");
  });

  it('tells the coach the rep ended it when they tap End', async () => {
    await render();
    await click('Renter');
    replies({ reply: 'Hi?', ended: false });
    await click('Knock');
    replies({ reply: 'Okay.', ended: false }, { id: 'p2', feedback: 'Score: 4/10\nResult: No sale', score: 4 });
    await type('Hi there.');
    await click('Send');
    await click('End & get feedback');
    expect(sent(2)).toMatchObject({ action: 'feedback', endedBy: 'rep' });
    expect(text()).toContain('4/10');
  });
});
