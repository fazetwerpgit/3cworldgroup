// @vitest-environment jsdom
//
// Hands-free Practice: a pause sends the rep's line, talking over the
// homeowner stops them, and talking past the homeowner's budget gets the rep
// cut off by a line written ahead. The mic and Gemini transcription are
// replaced by a fake that the test speaks through.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandsFreeEvents } from './handsFreeMic';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
const mic = vi.hoisted(() => ({
  events: null as HandsFreeEvents | null,
  finish: vi.fn(),
  close: vi.fn(),
  asked: 0,
  fail: false,
}));
vi.mock('./handsFreeMic', () => ({
  canHandsFree: () => true,
  askForMic: () => {
    mic.asked += 1;
    return Promise.resolve({});
  },
  openHandsFreeMic: async (_context: unknown, _stream: unknown, events: HandsFreeEvents) => {
    if (mic.fail) return null;
    mic.events = events;
    return { finish: mic.finish, close: mic.close };
  },
}));

import { RepPractice } from './RepPractice';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
let practiceAnswers: Response[] = [];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const pcm = () =>
  new Response(new Uint8Array([0x00, 0x40, 0x00, 0x40]), { status: 200, headers: { 'content-type': 'audio/L16;rate=24000;channels=1' } });
const says = (text: string, extra: Record<string, unknown> = {}) => ({ lines: [{ speaker: 'homeowner', text }], ended: false, budgetMs: 1000, ...extra });
const practiceBodies = () =>
  fetchMock.mock.calls
    .filter((call) => String(call[0]) === '/api/portal/ask/practice')
    .map((call) => JSON.parse(call[1].body as string));
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
const text = () => container.textContent ?? '';
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
/** Waits (real time) until the page shows what's expected. */
async function until(check: () => boolean, ms = 3_000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await wait(10);
  expect(check()).toBe(true);
}
const say = (fn: (events: HandsFreeEvents) => void) => act(async () => fn(mic.events!));

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  }
  createGain() {
    const param = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
    return { gain: param, connect: (node: unknown) => node };
  }
  createBiquadFilter() {
    return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: (node: unknown) => node };
  }
  createWaveShaper() {
    return { curve: null, connect: (node: unknown) => node };
  }
  decodeAudioData() {
    return Promise.reject(new Error('no sounds in tests'));
  }
  createBufferSource() {
    return { buffer: null, onended: null, connect: (node: unknown) => node, stop() {}, start() {} };
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  practiceAnswers = [];
  mic.events = null;
  mic.asked = 0;
  mic.fail = false;
  mic.finish.mockReset();
  mic.close.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/sounds/')) return new Response('', { status: 404 });
    if (url.endsWith('/mine')) return json({ sessions: [], assignments: [] });
    if (url.endsWith('/voice')) return pcm();
    return practiceAnswers.shift() ?? new Response('', { status: 503 });
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    }
  );
  Object.assign(window, {
    speechSynthesis: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] },
    AudioContext: FakeAudioContext,
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
  delete (window as unknown as Record<string, unknown>).AudioContext;
});

describe('RepPractice hands-free', () => {
  it('sends a line on a pause, stops the homeowner when talked over, and cuts off a rep who runs long', async () => {
    await act(async () => root.render(<RepPractice uid="r1" active canPick={false} onResume={() => {}} />));
    // Off until the rep turns it on; the choice sticks on this phone.
    expect(button('Hands-free')?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => button('Hands-free')!.click());
    expect(button('Hands-free')?.getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('ask3c-practice-hands-free')).toBe('on');

    // The mic is asked for in the Knock tap itself.
    practiceAnswers.push(json({ ...says('Hi?'), sessionId: 's1', ring: false, ambient: null }));
    await act(async () => button('Knock')!.click());
    expect(mic.asked).toBe(1);
    // The door opens, the homeowner speaks (0.85 s in the fake), then it's the rep's turn.
    expect(text()).toContain('Homeowner talking.');
    await until(() => text().includes('Listening. Just talk.'));

    // A pause ends the line: the server is told to finish the words, and the answer starts at once on the
    // words heard so far; the finished words match, so it stands (no second request).
    practiceAnswers.push(json(says("Okay, I'm listening. What is it?")));
    await say((e) => e.onSpeech(true, performance.now()));
    await say((e) => e.onInterim("Hi, I'm Sam"));
    await say((e) => e.onFinal("Hi, I'm Sam with 3C."));
    expect(text()).toContain("Hi, I'm Sam with 3C.");
    await say((e) => e.onSpeech(false, performance.now()));
    expect(mic.finish).toHaveBeenCalledTimes(1);
    expect(practiceBodies()[1]).toMatchObject({ action: 'turn', sessionId: 's1' });
    expect(practiceBodies()[1].history.at(-1)).toEqual({ role: 'rep', text: "Hi, I'm Sam with 3C." });
    await until(() => text().includes('Homeowner talking.'));
    expect(practiceBodies()).toHaveLength(2);

    // The homeowner's own words coming back through the speaker aren't the rep...
    await say((e) => e.onFinal("I'm listening what is it"));
    expect(text()).toContain('Homeowner talking.');
    // ...but the rep's are: the homeowner stops and it's the rep's turn, their words kept.
    await say((e) => e.onFinal('So let me tell you about fiber'));
    expect(text()).toContain("I'm listening what is it So let me tell you about fiber");

    // They keep talking past the budget (1 s here): the cut-in is written at 70% and plays at 100%.
    practiceAnswers.push(json({ lines: [{ speaker: 'homeowner', text: 'Whoa, slow down. What does it cost?' }] }));
    practiceAnswers.push(json(says('Whoa, slow down. What does it cost?')));
    await say((e) => e.onInterim('and it is really fast and'));
    await until(() => practiceBodies().at(-1)?.cut === true);
    const bodies = practiceBodies();
    const cutin = bodies.find((body) => body.action === 'cutin');
    expect(cutin).toMatchObject({ sessionId: 's1' });
    expect(cutin.partial).toContain('So let me tell you about fiber and it is really fast and');
    const cut = bodies.at(-1);
    expect(cut).toMatchObject({ action: 'turn', cut: true });
    expect(cut.history.at(-1).text).toMatch(/So let me tell you about fiber and it is really fast and…$/);
    await until(() => text().includes('Whoa, slow down. What does it cost?'));

    // Ending closes the mic; the feedback carries how long each answer took to start.
    practiceAnswers.push(json({ id: 'p1', feedback: 'Score: 5/10\nResult: No sale', score: 5, canRedo: false }));
    await until(() => !button('End')?.disabled);
    await act(async () => button('End')!.click());
    expect(mic.close).toHaveBeenCalled();
    const feedback = practiceBodies().at(-1);
    expect(feedback.action).toBe('feedback');
    expect(feedback.replyMs.length).toBeGreaterThanOrEqual(1);
  });

  it('sends the line again when the finished words differ from what the early answer was started on', async () => {
    window.localStorage.setItem('ask3c-practice-hands-free', 'on');
    await act(async () => root.render(<RepPractice uid="r1" active canPick={false} onResume={() => {}} />));
    practiceAnswers.push(json({ ...says('Hi?'), sessionId: 's1', ring: false, ambient: null }));
    await act(async () => button('Knock')!.click());
    await until(() => text().includes('Listening. Just talk.'));

    practiceAnswers.push(json(says('Pay for what?')), json(says("Spectrum's about ninety a month. Why?")));
    await say((e) => e.onSpeech(true, performance.now()));
    await say((e) => e.onInterim('so what do you pay'));
    await say((e) => e.onSpeech(false, performance.now()));
    // Started on the words at the pause...
    expect(practiceBodies()[1].history.at(-1)).toEqual({ role: 'rep', text: 'so what do you pay' });
    await say((e) => e.onFinal('So what do you pay for Spectrum right now each month?'));
    // ...then sent again on the finished line, and only that answer shows.
    await until(() => practiceBodies().length === 3);
    expect(practiceBodies()[2].history.at(-1)).toEqual({ role: 'rep', text: 'So what do you pay for Spectrum right now each month?' });
    expect(practiceBodies()[2].replacing).toBe('so what do you pay');
    await until(() => text().includes("Spectrum's about ninety a month. Why?"));
    expect(text()).not.toContain('Pay for what?');
  });

  it('turns the switch back off when the mic or connection fails, and offers only what is there (no Tap to talk here)', async () => {
    window.localStorage.setItem('ask3c-practice-hands-free', 'on');
    mic.fail = true;
    await act(async () => root.render(<RepPractice uid="r1" active canPick={false} onResume={() => {}} />));
    practiceAnswers.push(json({ ...says('Hi?'), sessionId: 's1', ring: false, ambient: null }));
    await act(async () => button('Knock')!.click());
    await until(() => text().includes('Hands-free stopped. Type what you say instead.'));
    expect(button('Hands-free')?.getAttribute('aria-pressed')).toBe('false');
    expect(window.localStorage.getItem('ask3c-practice-hands-free')).toBeNull();
  });

  it("shuts the door and stops the sounds from inside when the voice failed and the phone's voice read the last line", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/sounds/')) return new Response('', { status: 404 });
      if (url.endsWith('/mine')) return json({ sessions: [], assignments: [] });
      if (url.endsWith('/voice')) return new Response('', { status: 503 });
      return practiceAnswers.shift() ?? new Response('', { status: 503 });
    });
    Object.assign(window, {
      speechSynthesis: { speak: (u: { onend?: () => void }) => setTimeout(() => u.onend?.(), 0), cancel: vi.fn(), getVoices: () => [] },
    });
    await act(async () => root.render(<RepPractice uid="r1" active canPick={false} onResume={() => {}} />));
    practiceAnswers.push(json({ ...says('Hi?'), sessionId: 's1', ring: false, ambient: null }));
    await act(async () => button('Knock')!.click());
    practiceAnswers.push(json({ ...says('Seriously? No. Leave, please.'), ended: true, close: 'slam' }));
    practiceAnswers.push(json({ id: 'p1', feedback: 'Score: 1/10\nResult: No sale', score: 1, canRedo: false }));
    const box = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'Rude line.');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Send')!.click());
    await until(() => fetchMock.mock.calls.some((call) => String(call[0]) === '/sounds/practice/door-slam.mp3'));
  });
});
