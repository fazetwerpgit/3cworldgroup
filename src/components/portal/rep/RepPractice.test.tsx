// @vitest-environment jsdom
//
// Ask 3C Practice on the rep page: knock, pitch, the door closes, the feedback
// shows, practice again. With no speech APIs it is plain typing; with them the
// homeowner speaks in the session's voice (the phone's own when that fails)
// and a dictated line sends itself.
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
/** Answers for POST /api/portal/ask/practice and .../practice/voice, in order. */
let practiceAnswers: Array<Response | Promise<Response>> = [];
let voiceAnswers: Array<Response | Promise<Response>> = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function replies(...bodies: unknown[]) {
  for (const body of bodies) practiceAnswers.push(json(body));
}

const isVoice = (call: unknown[]) => String(call[0]).endsWith('/voice');
const practiceCalls = () => fetchMock.mock.calls.filter((call) => !isVoice(call));
const voiceCalls = () => fetchMock.mock.calls.filter(isVoice).map((call) => JSON.parse(call[1].body as string));
const sent = (call: number) => JSON.parse(practiceCalls()[call][1].body as string);
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

async function render(canPick = false) {
  await act(async () => root.render(<RepPractice uid="r1" active canPick={canPick} onResume={() => {}} />));
}

const CARD = 'Order screen (practice): Fiber 500 — $75/mo with AutoPay. Real prices come from your order screen.';
/** The knock's answer: the door opens and the session starts; the page learns nothing else. */
const door = (reply: string) => ({ reply, ended: false, sessionId: 's1' });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  practiceAnswers = [];
  voiceAnswers = [];
  fetchMock.mockImplementation(async (url: string) => {
    const next = (url.endsWith('/voice') ? voiceAnswers : practiceAnswers).shift();
    return next ?? new Response('', { status: 503 });
  });
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
  window.sessionStorage.clear();
  window.localStorage.clear();
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
    // Without speech APIs there's no Talk toggle; a rep gets no picker, just the door.
    expect(button('Talk')).toBeUndefined();
    expect(button('Surprise me')).toBeUndefined();
    expect(button('Price shopper')).toBeUndefined();
    replies(door('Yeah?'));
    await click('Knock');
    expect(sent(0)).toEqual({ action: 'turn', history: [] });
    expect(text()).toContain('HomeownerYeah?');
    expect(button('Leave')).toBeDefined();
    expect(container.querySelector('textarea')).not.toBeNull();

    replies(
      { reply: 'Deal, Thursday works.', ended: true },
      { id: 'p1', feedback: 'This was: Price shopper\nScore: 8/10\nResult: Sale\nWhat worked:\n- "Hi, I am with 3C."', score: 8 }
    );
    await type('Hi, I am with 3C.');
    await click('Send');
    // [END] arrived: the feedback is asked for on its own.
    expect(sent(1).history).toEqual([
      { role: 'customer', text: 'Yeah?' },
      { role: 'rep', text: 'Hi, I am with 3C.' },
    ]);
    expect(sent(1)).toMatchObject({ action: 'turn', sessionId: 's1' });
    expect(sent(1).persona).toBeUndefined();
    expect(sent(2)).toMatchObject({ action: 'feedback', sessionId: 's1', endedBy: 'homeowner' });
    expect(sent(2).history).toHaveLength(3);
    expect(text()).toContain('Session over');
    expect(text()).toContain('8/10');
    // The Score line isn't repeated under the badge; the headings and bullets render as such.
    expect(text()).not.toContain('Score:');
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['This was', 'Result', 'What worked']);
    expect(container.querySelector('ul li')?.textContent).toBe('"Hi, I am with 3C."');
    expect(text()).toContain('This wasPrice shopper');
    expect(container.querySelector('textarea')).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(PRACTICE_SESSION_KEY)!).feedback.score).toBe(8);

    await click('Practice again');
    expect(button('Knock')).toBeDefined();
    expect(window.sessionStorage.getItem(PRACTICE_SESSION_KEY)).toBeNull();
  });

  it('gets the price card only on Pull up price, shows it, then the homeowner answers it', async () => {
    await render();
    expect(button('Price')).toBeUndefined();
    replies(door('Yeah?'));
    await click('Knock');
    expect(text()).not.toContain('Order screen');
    replies({ card: CARD }, { reply: 'Seventy-five, huh. Okay.', ended: false });
    await click('Price');
    expect(sent(1)).toEqual({ action: 'price', sessionId: 's1' });
    expect(sent(2)).toMatchObject({ action: 'turn', sessionId: 's1' });
    expect(sent(2).history.map((turn: { role: string }) => turn.role)).toEqual(['customer', 'screen']);
    // The card comes first in the thread, then the homeowner's reaction to it.
    expect(text().indexOf(CARD)).toBeLessThan(text().indexOf('Seventy-five, huh.'));
    expect(button('Price')?.disabled).toBe(true);
  });

  it('at the daily limit: back to Knock with the reason, and no Try again', async () => {
    await render();
    practiceAnswers.push(json({ error: "That's 150 practice replies today, the daily limit." }, 429));
    await click('Knock');
    expect(text()).toContain("That's 150 practice replies today");
    expect(button('Knock')).toBeDefined();
    expect(button('Try again')).toBeUndefined();
    expect(container.querySelector('textarea')).toBeNull();

    replies(door('Hi?'));
    await click('Knock');
    practiceAnswers.push(json({ error: "That's 150 practice replies today, the daily limit." }, 429));
    await type('Hello there.');
    await click('Send');
    expect(text()).toContain("That's 150 practice replies today");
    expect(button('Try again')).toBeUndefined();
  });

  it('puts a line that got no answer back in the composer', async () => {
    await render();
    replies(door('Hi?'));
    await click('Knock');
    practiceAnswers.push(json({ error: 'The homeowner took too long.' }, 504));
    await type('Do you pay for internet yourself?');
    await click('Send');
    expect(text()).toContain('The homeowner took too long.');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Do you pay for internet yourself?');
    expect(text()).not.toContain('Do you pay for internet yourself?Homeowner');
  });

  it("with Talk on: unlocks audio on the knock, plays the session's voice through it, and sends a dictated line", async () => {
    const played: { element: HTMLMediaElement; src: string }[] = [];
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      played.push({ element: this, src: this.src });
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    let blobs = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:voice-${++blobs}`, revokeObjectURL: () => {} }));
    const wav = () => new Response(new Uint8Array(200), { status: 200, headers: { 'content-type': 'audio/wav' } });
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
    // The voice is still on its way: the orb holds the homeowner's place and the line waits for it.
    const { promise: voice, resolve: voiceArrives } = Promise.withResolvers<Response>();
    voiceAnswers.push(voice);
    replies(door('Hello, dear?'));
    await click('Knock');
    // Unlocked inside the tap, before anything was awaited.
    expect(played[0].src).toMatch(/^data:audio\/wav;base64,/);
    expect(spoken[0]).toEqual({ text: ' ', volume: 0 });
    expect(container.querySelector('[aria-label="The homeowner is answering"]')).not.toBeNull();
    expect(text()).not.toContain('Hello, dear?');
    await act(async () => voiceArrives(wav()));
    expect(voiceCalls()).toEqual([{ sessionId: 's1', text: 'Hello, dear?' }]);
    expect(text()).toContain('Hello, dear?');
    // The same unlocked element plays the voice; the phone's own voice stays quiet.
    expect(played[1]).toEqual({ element: played[0].element, src: 'blob:voice-1' });
    expect(spoken).toHaveLength(1);

    await click('Tap to talk');
    expect(recognition!.lang).toBe('en-US');
    await act(async () =>
      recognition!.onresult({ results: [[{ transcript: 'Hi, I am with' }], [{ transcript: ' 3C.' }]] })
    );
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Hi, I am with 3C.');
    // The voice fails this time (no answer queued: 503): the phone's own voice reads the line.
    replies({ reply: 'Oh?', ended: false });
    await click('Listening');
    expect(sent(1).history.at(-1)).toEqual({ role: 'rep', text: 'Hi, I am with 3C.' });
    expect(spoken.at(-1)?.text).toBe('Oh?');

    // Nothing heard: nothing sent, and a note to try again.
    await click('Tap to talk');
    await click('Listening');
    expect(practiceCalls()).toHaveLength(2);
    expect(text()).toContain("Didn't catch that — tap to try again.");

    // Talk off: no voice is fetched at all.
    await click('Talk on');
    const voices = voiceCalls().length;
    replies({ reply: 'Hm.', ended: false });
    await type('Quick question.');
    await click('Send');
    expect(text()).toContain('Hm.');
    expect(voiceCalls()).toHaveLength(voices);

    // Talk off sticks on this phone across visits.
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(button('Talk off')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('tells the coach the rep ended it when they tap End', async () => {
    await render();
    replies(door('Hi?'));
    await click('Knock');
    replies({ reply: 'Okay.', ended: false }, { id: 'p2', feedback: 'This was: Renter\nScore: 4/10\nResult: No sale', score: 4 });
    await type('Hi there.');
    await click('Send');
    await click('End');
    expect(sent(2)).toMatchObject({ action: 'feedback', endedBy: 'rep' });
    expect(text()).toContain('4/10');
  });

  it('lets an owner pick who answers, Surprise me by default', async () => {
    await render(true);
    expect(button('Surprise me')?.getAttribute('aria-pressed')).toBe('true');
    replies(door('Hi?'));
    await click('Knock');
    expect(sent(0)).toEqual({ action: 'turn', history: [], persona: 'surprise' });

    await click('Leave');
    await click('Already has AT&T Fiber');
    replies(door('Hi?'));
    await click('Knock');
    expect(sent(1)).toEqual({ action: 'turn', history: [], persona: 'att-fiber' });
  });
});
