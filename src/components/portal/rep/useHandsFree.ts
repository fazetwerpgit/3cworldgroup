'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BARGE_IN_WORDS, CUT_IN_PREPARE, nonEchoWords } from '@/lib/ask/practiceHandsFree';
import { openHandsFreeMic, type HandsFreeMic } from './handsFreeMic';

// Hands-free Practice: whose turn it is, from the mic.
//   listening  the rep's turn: words pile up; a pause sends them as the line.
//              Talking past the homeowner's budget gets them cut off: the
//              interruption is written at CUT_IN_PREPARE of it and played at
//              the full budget.
//   thinking   the line went; the homeowner is answering (the mic is ignored)
//   speaking   the homeowner's voice is playing; the rep talking over it
//              (words that aren't the homeowner's own, echoed) stops it and
//              it's their turn again
// The page does the talking to the server and the playing; this only decides
// when.

export type HandsFreeStatus = 'off' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused';

/** After the rep's pause, the last words are waited on this long at most (the server usually needs ~0.3 s). */
const FINAL_WAIT_MS = 1_200;
/** After the last words arrive, a moment for any straggler. */
const FINAL_SETTLE_MS = 150;
/** At the pause the words were already final (the server finished them itself): a short wait for more. */
const NOTHING_PENDING_MS = 300;
/** After a cut-in starts playing, the rep still talking for a beat doesn't count as talking over it. */
const CUT_IN_GRACE_MS = 2_500;
const DEFAULT_BUDGET_MS = 15_000;

export interface HandsFreeHandlers<Prepared> {
  /** The rep's line, heard in full: send it. `ms` is how long they spoke. */
  onLine(text: string, ms: number): void;
  /**
   * The rep paused: start the answer now on the words heard so far, before the
   * transcript is final (onLine then decides whether it still fits).
   */
  speculate(text: string): void;
  /** They went on talking after all: that early answer is for a line that isn't over. */
  dropSpeculation(): void;
  /** The rep has talked most of their budget: write the interruption from what they've said so far. */
  prepareCut(partial: string): Promise<Prepared | null>;
  /** The budget is up and they're still talking: play it over them. `partial` is what they'd said, over `ms`. */
  cut(prepared: Prepared, partial: string, ms: number): void;
  /** The rep talked over the homeowner: stop the voice. */
  bargeIn(): void;
  /** The mic or the connection is gone. */
  onLost(): void;
}

export function useHandsFree<Prepared>(handlers: HandsFreeHandlers<Prepared>) {
  const [status, setStatus] = useState<HandsFreeStatus>('off');
  const [heard, setHeard] = useState('');
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const micRef = useRef<HandsFreeMic | null>(null);
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  const state = useRef({
    status: 'off' as HandsFreeStatus,
    finals: [] as string[],
    interim: '',
    /** When the rep started this line (0: not yet). */
    speechStart: 0,
    /** When they last stopped. */
    speechEnd: 0,
    ending: 0,
    settle: 0,
    timers: [] as number[],
    prepared: null as Promise<Prepared | null> | null,
    homeowner: '',
    graceUntil: 0,
    budgetMs: DEFAULT_BUDGET_MS,
    /** When the line went, for how long the homeowner took to answer. */
    sentAt: 0,
    /** An answer was started early at this pause. */
    speculated: false,
    replyMs: [] as number[],
  });

  const set = useCallback((next: HandsFreeStatus) => {
    state.current.status = next;
    setStatus(next);
  }, []);

  const text = () => [...state.current.finals, state.current.interim].join(' ').replace(/\s+/g, ' ').trim();

  const clearLine = useCallback(() => {
    const s = state.current;
    for (const timer of s.timers) window.clearTimeout(timer);
    window.clearTimeout(s.ending);
    window.clearTimeout(s.settle);
    s.timers = [];
    s.ending = 0;
    s.settle = 0;
    s.finals = [];
    s.interim = '';
    s.speechStart = 0;
    s.prepared = null;
    setHeard('');
  }, []);

  const commit = () => {
    const s = state.current;
    const line = text();
    const ms = Math.max(0, s.speechEnd - s.speechStart);
    const speculated = s.speculated;
    s.speculated = false;
    clearLine();
    if (!line) {
      if (speculated) handlersRef.current.dropSpeculation();
      return;
    }
    set('thinking');
    s.sentAt = s.speechEnd || performance.now();
    handlersRef.current.onLine(line, ms);
  };

  const armBudget = () => {
    const s = state.current;
    const prepareAt = window.setTimeout(() => {
      const partial = text();
      if (s.status !== 'listening' || !partial) return;
      s.prepared = handlersRef.current.prepareCut(partial);
    }, s.budgetMs * CUT_IN_PREPARE);
    const cutAt = window.setTimeout(() => {
      const prepared = s.prepared;
      if (s.status !== 'listening' || !prepared) return;
      void prepared.then((ready) => {
        // They stopped (and the line went) while it was being written: it's dropped.
        if (!ready || s.status !== 'listening' || s.prepared !== prepared) return;
        const partial = text();
        const ms = Math.round(performance.now() - s.speechStart);
        clearLine();
        micRef.current?.finish();
        s.graceUntil = performance.now() + CUT_IN_GRACE_MS;
        set('speaking');
        handlersRef.current.cut(ready, partial, ms);
      });
    }, s.budgetMs);
    s.timers.push(prepareAt, cutAt);
  };

  const onInterim = (words: string) => {
    const s = state.current;
    if (s.status === 'listening') {
      s.interim = words;
      setHeard(text());
    } else if (s.status === 'speaking') {
      s.interim = words;
      checkBargeIn();
    }
  };

  const onFinal = (words: string) => {
    const s = state.current;
    if (s.status === 'listening') {
      s.finals.push(words);
      s.interim = '';
      setHeard(text());
      if (s.ending) {
        window.clearTimeout(s.settle);
        s.settle = window.setTimeout(commit, FINAL_SETTLE_MS);
      }
    } else if (s.status === 'speaking') {
      s.finals.push(words);
      s.interim = '';
      checkBargeIn();
    }
  };

  /** While the homeowner talks: enough words of the rep's own and the homeowner stops. */
  const checkBargeIn = () => {
    const s = state.current;
    if (performance.now() < s.graceUntil) return;
    if (nonEchoWords(text(), s.homeowner).length < BARGE_IN_WORDS) return;
    handlersRef.current.bargeIn();
    // Their words so far start the line; they've been talking about a second.
    const finals = s.finals;
    const interim = s.interim;
    clearLine();
    s.finals = finals;
    s.interim = interim;
    s.speechStart = performance.now() - 1_000;
    set('listening');
    setHeard(text());
    armBudget();
  };

  const onSpeech = (speaking: boolean, at: number) => {
    const s = state.current;
    if (s.status !== 'listening') return;
    if (speaking) {
      // Talking again before the last words came back: it's all one line, and an early answer is moot.
      window.clearTimeout(s.ending);
      window.clearTimeout(s.settle);
      s.ending = 0;
      if (s.speculated) {
        s.speculated = false;
        handlersRef.current.dropSpeculation();
      }
      if (!s.speechStart) {
        s.speechStart = at;
        armBudget();
      }
      return;
    }
    if (!s.speechStart) return;
    s.speechEnd = at;
    micRef.current?.finish();
    // The answer starts on what's been heard; the finished words arrive while it's being written.
    const guess = text();
    if (guess && !s.speculated) {
      s.speculated = true;
      handlersRef.current.speculate(guess);
    }
    s.ending = window.setTimeout(commit, FINAL_WAIT_MS);
    // Words already in and nothing pending: no need to wait the whole time.
    if (s.finals.length && !s.interim) s.settle = window.setTimeout(commit, NOTHING_PENDING_MS);
  };

  // The mic's handlers outlive the render that opened it; they go through these.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onSpeechRef = useRef(onSpeech);
  useEffect(() => {
    onInterimRef.current = onInterim;
    onFinalRef.current = onFinal;
    onSpeechRef.current = onSpeech;
  });

  const stop = useCallback(() => {
    clearLine();
    micRef.current?.close();
    micRef.current = null;
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    set('off');
  }, [clearLine, set]);

  /** Opens the mic (asked for inside the tap) and starts listening once the homeowner is done. */
  const start = useCallback(
    async (context: AudioContext, mic: Promise<MediaStream>, first: 'listening' | 'thinking') => {
      stop();
      set('starting');
      const opened = await openHandsFreeMic(context, mic, {
        onInterim: (words) => onInterimRef.current(words),
        onFinal: (words) => onFinalRef.current(words),
        onSpeech: (speaking, at) => onSpeechRef.current(speaking, at),
        onLost: () => {
          micRef.current = null;
          stop();
          handlersRef.current.onLost();
        },
      });
      if (!opened) {
        set('off');
        handlersRef.current.onLost();
        return false;
      }
      micRef.current = opened;
      // A phone that dims mid-pitch drops the mic: keep the screen on where the browser allows it.
      const wakeLock = (
        navigator as unknown as {
          wakeLock?: {
            request(type: 'screen'): Promise<{ release(): Promise<void> }>;
          };
        }
      ).wakeLock;
      wakeLock
        ?.request('screen')
        .then((lock) => {
          wakeRef.current = lock;
        })
        .catch(() => {});
      if (state.current.status === 'starting') set(first);
      return true;
    },
    [set, stop],
  );

  useEffect(() => () => stop(), [stop]);

  const controls = useMemo(
    () => ({
      start,
      stop,
      /** Paused (the app went to the background): the mic is closed until a tap resumes it. */
      pause: () => {
        if (!micRef.current) return;
        stop();
        set('paused');
      },
      /** The homeowner's voice starts: the rep may talk over it. */
      speaking: (line: string) => {
        const s = state.current;
        if (s.status === 'off' || s.status === 'paused') return;
        if (s.sentAt) {
          s.replyMs.push(Math.round(performance.now() - s.sentAt));
          s.sentAt = 0;
        }
        clearLine();
        s.homeowner = line;
        set('speaking');
      },
      /** The homeowner is done (or there was nothing to play): the rep's turn. What the mic heard meanwhile was them. */
      listen: () => {
        const s = state.current;
        if (s.status === 'off' || s.status === 'paused' || s.status === 'starting') return;
        clearLine();
        set('listening');
      },
      /** The line went some other way (typed, a tap): the homeowner is answering. */
      thinking: () => {
        const s = state.current;
        if (s.status === 'off' || s.status === 'paused' || s.status === 'starting' || s.status === 'thinking') return;
        clearLine();
        s.sentAt = performance.now();
        set('thinking');
      },
      /** How long the rep may talk next (from the homeowner's reply). */
      setBudget: (ms: number | undefined) => {
        if (typeof ms === 'number' && ms > 0) state.current.budgetMs = ms;
      },
      /** How long each answer took to start playing after the rep stopped, this practice. */
      takeReplyMs: () => {
        const all = state.current.replyMs;
        state.current.replyMs = [];
        return all;
      },
    }),
    [start, stop, set, clearLine],
  );
  return { status, heard, ...controls };
}
