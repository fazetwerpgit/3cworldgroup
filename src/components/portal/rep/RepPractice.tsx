'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { AudioLines, DoorClosed, DoorOpen, Mic, MonitorSmartphone, RotateCw, SendHorizontal, Shuffle, Undo2, Volume2, VolumeX } from 'lucide-react';
import { BorderBeam } from 'border-beam';
import { ThinkingOrb } from 'thinking-orbs';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ASK_IDLE_RESET_MS } from '@/lib/ask/chat';
import {
  MAX_PRACTICE_TURNS,
  MAX_REP_CHARS,
  PERSONAS,
  PRACTICE_SESSION_KEY,
  isPersonaChoice,
  type PersonaChoice,
  type PracticeEndedBy,
  type PracticeCutInReply,
  type PracticeFeedbackReply,
  type PracticeKnockReply,
  type PracticePriceReply,
  type PracticeRedoReply,
  type PracticeTurn,
  type PracticeTurnReply,
} from '@/lib/ask/practice';
import type { Ambient, BeatKind, PracticeLine } from '@/lib/ask/practiceDoor';
import { deliveryLine, fillerCount, parseDelivery, type PracticeDelivery } from '@/lib/ask/practiceCoaching';
import { pickVoice, spokenText } from '@/lib/ask/practiceVoice';
import s from './rep.module.css';
import p from './rep-page.module.css';
import a from './rep-ask.module.css';
import pr from './rep-practice.module.css';
import { PracticeFeedback } from './PracticeFeedback';
import { PracticeMine } from './PracticeMine';
import { openVoice, unlockVoicePlayer, type OpenVoice, type PracticeEffect, type VoicePlayer } from './practiceAudio';
import { askForMic, canHandsFree } from './handsFreeMic';
import { useHandsFree } from './useHandsFree';

// Ask 3C Practice: the rep knocks and pitches; the homeowner (the model)
// answers until the door closes, they sign up, or the rep ends it, then a
// coach grades the pitch (POST /api/portal/ask/practice). Who is behind the
// door is drawn by the server and stays there: the page holds only the session
// id, and the rep learns who it was from the feedback. Owners can pick one to
// demo it ("Surprise me" by default).
// Talk mode speaks the homeowner in the session's own voice (Gemini TTS via
// POST /api/portal/ask/practice/voice, played through one audio element the
// Knock tap unlocks, so iOS lets it play after an await), falling back to the
// phone's speechSynthesis, and takes the rep's lines by voice
// (SpeechRecognition) on the phone; typing always works.
// Hands-free (off unless turned on, on this phone): the mic stays open for the
// practice and streams to live transcription (handsFreeMic); a pause sends the
// line, talking over the homeowner stops them, and a rep who talks past the
// homeowner's budget gets cut off by a line written ahead (useHandsFree).
// The session lives in sessionStorage under its own key, tagged with the uid,
// with the same idle reset as Ask.
// Over time: the feedback carries four skill scores and, with Talk on, plain
// delivery facts (talk share, pace, fillers from the dictated lines); "Redo
// that moment" restarts the same door just before the line that went worst;
// below Knock, the owner's assignments and My practice (PracticeMine).

interface Session {
  /** Set when the door opens (the knock's reply); null while the knock is in flight or failed. */
  sessionId: string | null;
  /** An owner's pick for the knock; reps always get a surprise. */
  pick: PersonaChoice;
  turns: PracticeTurn[];
  /** The homeowner closed the door or signed up, or the rep ended it. */
  ended: boolean;
  /** Who ended it; the coach grades the Result by it. */
  endedBy?: PracticeEndedBy;
  feedback: {
    text: string;
    score: number | null;
    /** The practiceLog id: what "Redo that moment" starts from. */
    id?: string;
    canRedo?: boolean;
  } | null;
  /** Talk mode's timing and words over this practice, shown with the feedback; none when the rep typed. */
  delivery?: PracticeDelivery | null;
  /** A "Redo that moment" practice: the turns before this index are the first try, replayed. */
  redoFrom?: number;
  /** The homeowner only talks through a Ring doorbell camera (from the knock). */
  ring?: boolean;
  /** The sound from inside the house (from the knock). */
  ambient?: Ambient | null;
}

interface StoredSession extends Session {
  uid: string;
  lastAt: number;
}

type Busy = 'turn' | 'feedback' | 'redo' | null;
/** null: nothing to retry today (the daily limit). */
type Retry = 'turn' | 'send' | 'feedback' | null;

const REQUEST_TIMEOUT_MS = 60_000;
/** The door-open sound plays out before the first line at the door. */
const DOOR_OPEN_S = 0.6;
const BEAT_SOUNDS: Record<BeatKind, PracticeEffect> = { phone: 'phone-buzz', kid: 'kid-whine', pot: 'pot-boil' };

/** Who's talking, above a homeowner-side bubble. */
const speakerLabel = (turn: PracticeTurn, ring: boolean) =>
  turn.speaker === 'spouse' ? 'Spouse' : turn.speaker === 'kid' ? 'Kid' : ring ? 'Homeowner · Ring camera' : 'Homeowner';

/** A reply line as a turn of the conversation: the homeowner's own lines carry no speaker. */
const customerTurn = (line: PracticeLine): PracticeTurn =>
  line.speaker === 'spouse' || line.speaker === 'kid'
    ? { role: 'customer', text: line.text, speaker: line.speaker }
    : { role: 'customer', text: line.text };
const noDelivery = (): PracticeDelivery => ({ talkMs: 0, listenMs: 0, words: 0, fillers: {}, lines: 0 });
/** A spoken line's length when the mic heard only a word or two (its first and last words came together). */
const MIN_LINE_MS = 600;

/** Talk mode: this long without new words ends the rep's line and sends it. */
const SILENCE_MS = 1600;
/** And this long with no words at all gives up listening. */
const FIRST_WORD_MS = 8000;

/** This rep's stored practice, unless it went idle. Anyone else's (a shared phone) is thrown away. */
export function readStoredPractice(uid: string): Session | null {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(PRACTICE_SESSION_KEY) ?? 'null') as StoredSession | null;
    if (
      !raw ||
      raw.uid !== uid ||
      typeof raw.sessionId !== 'string' ||
      !Array.isArray(raw.turns) ||
      typeof raw.lastAt !== 'number' ||
      Date.now() - raw.lastAt > ASK_IDLE_RESET_MS
    ) {
      window.sessionStorage.removeItem(PRACTICE_SESSION_KEY);
      return null;
    }
    return {
      sessionId: raw.sessionId,
      pick: isPersonaChoice(raw.pick) ? raw.pick : 'surprise',
      turns: raw.turns
        .filter(
          (turn) =>
            turn && (turn.role === 'rep' || turn.role === 'customer' || turn.role === 'screen') && typeof turn.text === 'string'
        )
        .map((turn) =>
          turn.role === 'customer' && (turn.speaker === 'spouse' || turn.speaker === 'kid')
            ? { role: turn.role, text: turn.text, speaker: turn.speaker }
            : { role: turn.role, text: turn.text }
        ),
      ended: raw.ended === true,
      endedBy: raw.endedBy === 'homeowner' || raw.endedBy === 'rep' ? raw.endedBy : undefined,
      feedback: raw.feedback && typeof raw.feedback.text === 'string' ? raw.feedback : null,
      delivery: parseDelivery(raw.delivery),
      redoFrom: Number.isInteger(raw.redoFrom) ? raw.redoFrom : undefined,
      ring: raw.ring === true,
      ambient: raw.ambient === 'dog' || raw.ambient === 'kids' || raw.ambient === 'tv' || raw.ambient === 'kitchen' ? raw.ambient : null,
    };
  } catch {
    return null;
  }
}

function storeSession(uid: string, session: Session | null) {
  try {
    if (!session) window.sessionStorage.removeItem(PRACTICE_SESSION_KEY);
    else {
      window.sessionStorage.setItem(
        PRACTICE_SESSION_KEY,
        JSON.stringify({ ...session, uid, lastAt: Date.now() } satisfies StoredSession)
      );
    }
  } catch {
    // Private mode or a full quota: the practice just won't survive a reload.
  }
}

async function post<T>(
  body: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const token = await getIdToken();
    const res = await fetch('/api/portal/ask/practice', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.ok) return { ok: true, data: json };
    return { ok: false, error: json.error || "That didn't go through. Try again.", status: res.status };
  } catch {
    return { ok: false, error: 'Nothing came back. Check your signal and try again.', status: 0 };
  }
}

// ---- the browser's speech APIs (not in every TypeScript DOM lib, so typed here) ----

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionClass(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const noSubscribe = () => () => {};

/** Talk on/off is this phone's preference, kept across visits (not rep data, so sign-out leaves it). */
const TALK_PREF_KEY = 'ask3c-practice-talk';
/** Hands-free is off unless the rep turned it on, on this phone. */
const HANDS_FREE_PREF_KEY = 'ask3c-practice-hands-free';

function readHandsFree(): boolean {
  try {
    return window.localStorage.getItem(HANDS_FREE_PREF_KEY) === 'on';
  } catch {
    return false;
  }
}

/** A hands-free interruption, written and its voice fetched ahead of the moment it plays. */
interface PreparedCut {
  sessionId: string;
  /** The conversation it was written for. */
  turns: PracticeTurn[];
  lines: PracticeLine[];
  voice: OpenVoice | null;
}

function readTalkOff(): boolean {
  try {
    return window.localStorage.getItem(TALK_PREF_KEY) === 'off';
  } catch {
    return false;
  }
}


export function RepPractice({
  uid,
  active,
  canPick,
  onResume,
}: {
  uid: string;
  active: boolean;
  /** Owners pick who is behind the door (to demo one); reps never do. */
  canPick: boolean;
  onResume: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [choice, setChoice] = useState<PersonaChoice>('surprise');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState<{ message: string; retry: Retry } | null>(null);
  const [notice, setNotice] = useState('');
  // Read on the first client render; the server renders no Talk button (canSpeak is false there).
  const [talkOff, setTalkOff] = useState(() => typeof window !== 'undefined' && readTalkOff());
  const [listening, setListening] = useState(false);
  const [micBroken, setMicBroken] = useState(false);
  const [handsFreeOn, setHandsFreeOn] = useState(() => typeof window !== 'undefined' && readHandsFree());
  const reducedMotion = usePrefersReducedMotion();
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const heardRef = useRef('');
  const skipSendRef = useRef(false);
  const silenceRef = useRef<number | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});
  /** Plays the homeowner's streamed voice (Web Audio, unlocked by a tap, reused). */
  const playerRef = useRef<VoicePlayer | null>(null);
  /** Bumped whenever speech should stop: a voice that arrives after that stays quiet. */
  const speechRef = useRef(0);
  /**
   * Talk mode's delivery over the practice under way: counted from the knock
   * (or redo), so none after a reload, when part of it would be missing.
   */
  const deliveryRef = useRef<PracticeDelivery | null>(null);
  /** The line the mic just heard and how long the rep spoke it, until it's sent (unchanged). */
  const spokenRef = useRef<{ text: string; ms: number } | null>(null);

  const canSpeak = useSyncExternalStore(noSubscribe, () => 'speechSynthesis' in window, () => false);
  const canListen = useSyncExternalStore(noSubscribe, () => recognitionClass() !== undefined, () => false);
  const talk = canSpeak && !talkOff;
  const canHandsFreeHere = useSyncExternalStore(noSubscribe, canHandsFree, () => false);
  const handsFree = talk && canHandsFreeHere && handsFreeOn;
  const hands = useHandsFree<PreparedCut>({
    onLine: (text, ms) => {
      spokenRef.current = { text, ms: Math.max(MIN_LINE_MS, ms) };
      sendRef.current(text);
    },
    prepareCut: async (partial) => {
      const sessionId = session?.sessionId;
      if (!session || !sessionId || session.ended || busy) return null;
      const turns = session.turns;
      const result = await post<PracticeCutInReply>({ action: 'cutin', sessionId, history: turns, partial: partial.slice(0, MAX_REP_CHARS) });
      const lines = result.ok && Array.isArray(result.data.lines) ? result.data.lines.filter((line) => line?.text) : [];
      if (!lines.length) return null;
      const voice = playerRef.current ? await openVoice(sessionId, lines[0].text) : null;
      return { sessionId, turns, lines, voice };
    },
    cut: (prepared, partial, ms) => void cutIn(prepared, partial, ms),
    bargeIn: () => {
      speechRef.current += 1;
      playerRef.current?.fadeOut();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    onLost: () => setNotice('Hands-free stopped. Tap to talk still works.'),
  });
  const pauseHands = hands.pause;

  const scrollDown = useCallback((behavior: ScrollBehavior) => {
    window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior }));
  }, []);

  const clearSilence = () => {
    if (silenceRef.current !== null) window.clearTimeout(silenceRef.current);
    silenceRef.current = null;
  };

  /** Quiet: stop the homeowner's voice (and one still on its way) and the phone's voice. */
  const stopSpeaking = useCallback(() => {
    speechRef.current += 1;
    playerRef.current?.stop();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  /** Inside a tap: the voice player, so iOS lets it play later lines after an await. Once is enough. */
  const unlockAudio = () => {
    if (!playerRef.current) playerRef.current = unlockVoicePlayer();
  };

  /** Stop listening: send what was heard, or throw it away. */
  const stopListening = useCallback((send: boolean) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    skipSendRef.current = !send;
    if (send) recognition.stop();
    else recognition.abort();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const restored = readStoredPractice(uid);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only after mount
    setSession(restored);
    if (restored) {
      onResume();
      scrollDown('instant');
    }
  }, [uid, scrollDown, onResume]);

  useEffect(() => {
    // Leaving Practice (the Ask tab, another page) silences the homeowner and the mic.
    if (active) return;
    stopSpeaking();
    playerRef.current?.quiet();
    stopListening(false);
    pauseHands();
  }, [active, stopListening, stopSpeaking, pauseHands]);

  useEffect(() => {
    // Some browsers load their voices late; asking once starts that.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    return () => {
      stopSpeaking();
      playerRef.current?.quiet();
      recognitionRef.current?.abort();
    };
  }, [stopSpeaking]);

  useEffect(() => {
    // Back from the background: quiet, and after the idle window a fresh start.
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        stopSpeaking();
        playerRef.current?.quiet();
        stopListening(false);
        // The phone may take the mic back in the background: hands-free waits for a tap to resume.
        pauseHands();
        return;
      }
      setSession((current) => (current && !readStoredPractice(uid) ? null : current));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, stopListening, stopSpeaking, pauseHands]);

  const save = (next: Session | null) => {
    setSession(next);
    storeSession(uid, next);
  };

  /** The phone's own voice, when the session's voice didn't come through. Generic on purpose: it says nothing about who this is. */
  const speakFallback = (line: string) => {
    const text = spokenText(line);
    if (!text || !('speechSynthesis' in window)) {
      hands.listen();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    const voice = pickVoice(synth.getVoices(), null, 0);
    if (voice) utterance.voice = voice;
    hands.speaking(text);
    utterance.onend = () => hands.listen();
    synth.speak(utterance);
  };

  const requestFeedback = async (current: Session) => {
    setBusy('feedback');
    setFailed(null);
    scrollDown('smooth');
    const delivery = current.delivery ?? (deliveryRef.current?.lines ? deliveryRef.current : null);
    hands.stop();
    const replyMs = hands.takeReplyMs();
    const result = await post<PracticeFeedbackReply>({
      action: 'feedback',
      sessionId: current.sessionId,
      history: current.turns,
      endedBy: current.endedBy ?? 'rep',
      ...(delivery ? { delivery } : {}),
      ...(replyMs.length ? { replyMs } : {}),
    });
    setBusy(null);
    if (result.ok && result.data.feedback) {
      const { feedback: text, score, id, canRedo } = result.data;
      save({ ...current, ended: true, delivery, feedback: { text, score, id, canRedo: canRedo === true } });
    } else {
      setFailed({
        message: result.ok ? 'No feedback came back. Try again.' : result.error,
        retry: !result.ok && result.status === 429 ? null : 'feedback',
      });
    }
    scrollDown('smooth');
  };

  /**
   * The homeowner's next line: the door opening (no turns yet), the answer to
   * the rep's last line, or a reaction to the price card just pulled up. With
   * Talk on, the line waits (orb showing) for its voice, then shows and plays.
   */
  const requestTurn = async (current: Session) => {
    setBusy('turn');
    setFailed(null);
    setNotice('');
    scrollDown('smooth');
    const quiet = speechRef.current;
    const knocked = current.turns.length === 0;
    const result = await post<PracticeTurnReply & Partial<PracticeKnockReply>>(
      knocked
        ? { action: 'turn', history: [], ...(canPick ? { persona: current.pick } : {}) }
        : { action: 'turn', sessionId: current.sessionId, history: current.turns }
    );
    const lines = result.ok && Array.isArray(result.data.lines) ? result.data.lines.filter((line) => line?.text) : [];
    if (result.ok && lines.length && (!knocked || result.data.sessionId)) {
      const { ended, close, beat } = result.data;
      hands.setBudget(result.data.budgetMs);
      const next: Session = {
        ...current,
        ...(knocked
          ? { sessionId: result.data.sessionId ?? null, ring: result.data.ring === true, ambient: result.data.ambient ?? null }
          : {}),
        turns: [...current.turns, ...lines.map(customerTurn)],
        ended,
        endedBy: ended ? 'homeowner' : undefined,
      };
      // With Talk on the bubbles wait (orb showing) for the first voice's first audio, then show as it starts.
      const player = playerRef.current;
      const first = talk && player && next.sessionId ? await openVoice(next.sessionId, lines[0].text) : null;
      setBusy(null);
      save(next);
      // The rep started talking or typing meanwhile: the lines show, unspoken.
      if (talk && speechRef.current === quiet) {
        if (player) {
          player.setRing(next.ring === true);
          if (knocked && !next.ring) {
            player.effect('door-open');
            player.ambient(next.ambient ?? null);
          }
          if (beat) player.effect(BEAT_SOUNDS[beat]);
        }
        if (first && player) void speakLines(player, first, lines, next, ended ? close ?? 'shut' : null);
        else speakFallback(lines.map((line) => line.text).join(' '));
      } else {
        void first?.reader.cancel().catch(() => {});
        hands.listen();
      }
      scrollDown('smooth');
      if (ended) await requestFeedback(next);
      return;
    }
    setBusy(null);
    hands.listen();
    const error = result.ok ? 'The homeowner went quiet. Try again.' : result.error;
    const retryable = result.ok || result.status !== 429;
    if (knocked) {
      // No door opened: back to Knock, with why.
      save(null);
      setNotice(error);
      return;
    }
    const last = current.turns.at(-1);
    if (last?.role === 'rep') {
      // Nothing to show for it: the line goes back in the composer, ready for Try again.
      save({ ...current, turns: current.turns.slice(0, -1) });
      setDraft(last.text);
      setFailed({ message: error, retry: retryable ? 'send' : null });
    } else {
      setFailed({ message: error, retry: retryable ? 'turn' : null });
    }
    scrollDown('smooth');
  };

  /**
   * Plays a reply's voices one after another (the spouse chiming in after the
   * homeowner), then shuts the door when the reply ended it.
   */
  const speakLines = async (
    player: VoicePlayer,
    first: OpenVoice,
    lines: PracticeLine[],
    current: Session,
    close: 'slam' | 'shut' | null
  ) => {
    const quiet = speechRef.current;
    const delay = current.turns.length === lines.length && !current.ring ? DOOR_OPEN_S : 0;
    // Hands-free: the rep may talk over the homeowner from here, and it's their turn once the voice is done.
    const listenAfter = () => {
      if (speechRef.current !== quiet || close) return;
      window.setTimeout(() => {
        if (speechRef.current === quiet) hands.listen();
      }, player.voiceLeft() * 1000);
    };
    hands.speaking(lines.map((line) => line.text).join(' '));
    // The rep's delivery counts the homeowner's voice as time spent listening, as long as it played.
    const tally = deliveryRef.current;
    const started = performance.now() + delay * 1000;
    const heard = () => {
      if (tally && tally === deliveryRef.current) tally.listenMs += Math.max(0, Math.round(performance.now() - started));
    };
    await player.play(first, { delay });
    for (const line of lines.slice(1)) {
      const voice = speechRef.current === quiet && current.sessionId ? await openVoice(current.sessionId, line.text) : null;
      if (!voice || speechRef.current !== quiet) {
        listenAfter();
        return heard();
      }
      await player.queue(voice);
    }
    heard();
    listenAfter();
    if (close && speechRef.current === quiet) player.closeDoor(current.ring ? null : close === 'slam' ? 'door-slam' : 'door-close');
  };

  const sendLine = (typed: string) => {
    const text = typed.trim();
    if (!session || session.ended || busy || !text) return;
    if (text.length > MAX_REP_CHARS) {
      setNotice(`Keep it under ${MAX_REP_CHARS} characters.`);
      return;
    }
    stopSpeaking();
    if (talk) unlockAudio();
    setDraft('');
    setNotice('');
    // A line the mic heard and the rep sent as it was counts toward delivery; typed or edited ones don't.
    const spoken = spokenRef.current;
    spokenRef.current = null;
    const tally = deliveryRef.current;
    if (tally && spoken?.text === text) {
      tally.talkMs += spoken.ms;
      tally.words += text.split(/\s+/).filter(Boolean).length;
      tally.lines += 1;
      for (const [word, n] of Object.entries(fillerCount(text))) tally.fillers[word] = (tally.fillers[word] ?? 0) + n;
    }
    const next: Session = { ...session, turns: [...session.turns, { role: 'rep', text }] };
    save(next);
    hands.thinking();
    void requestTurn(next);
  };

  /**
   * Hands-free: the rep talked past the homeowner's budget. The interruption
   * written ahead plays over them at once; the turn that makes it count (the
   * judge on their cut-off line) runs meanwhile.
   */
  const cutIn = async (prepared: PreparedCut, partial: string, ms: number) => {
    if (!session || session.ended || busy || session.sessionId !== prepared.sessionId || session.turns.length !== prepared.turns.length) {
      void prepared.voice?.reader.cancel().catch(() => {});
      hands.listen();
      return;
    }
    const said = partial.slice(0, MAX_REP_CHARS - 1);
    const rep: PracticeTurn = { role: 'rep', text: `${said}…` };
    const tally = deliveryRef.current;
    if (tally && said) {
      tally.talkMs += Math.max(MIN_LINE_MS, ms);
      tally.words += said.split(/\s+/).filter(Boolean).length;
      tally.lines += 1;
      for (const [word, n] of Object.entries(fillerCount(said))) tally.fillers[word] = (tally.fillers[word] ?? 0) + n;
    }
    const withRep: Session = { ...session, turns: [...prepared.turns, rep] };
    const shown: Session = { ...withRep, turns: [...withRep.turns, ...prepared.lines.map(customerTurn)] };
    setDraft('');
    save(shown);
    scrollDown('smooth');
    const player = playerRef.current;
    if (prepared.voice && player) void speakLines(player, prepared.voice, prepared.lines, shown, null);
    else speakFallback(prepared.lines.map((line) => line.text).join(' '));
    setBusy('turn');
    const result = await post<PracticeTurnReply>({ action: 'turn', sessionId: prepared.sessionId, history: withRep.turns, cut: true });
    setBusy(null);
    const lines = result.ok && Array.isArray(result.data.lines) ? result.data.lines.filter((line) => line?.text) : [];
    if (!result.ok || !lines.length) {
      stopSpeaking();
      save({ ...withRep, turns: prepared.turns });
      setDraft(rep.text);
      setFailed({ message: result.ok ? 'The homeowner went quiet. Try again.' : result.error, retry: !result.ok && result.status === 429 ? null : 'send' });
      hands.listen();
      return;
    }
    hands.setBudget(result.data.budgetMs);
    const next: Session = {
      ...withRep,
      turns: [...withRep.turns, ...lines.map(customerTurn)],
      ended: result.data.ended,
      endedBy: result.data.ended ? 'homeowner' : undefined,
    };
    save(next);
    if (result.data.ended) {
      if (talk) player?.closeDoor(next.ring ? null : result.data.close === 'slam' ? 'door-slam' : 'door-close');
      await requestFeedback(next);
    }
  };

  /** Inside a tap: the mic for hands-free, opened once for this practice. */
  const startHandsFree = (first: 'listening' | 'thinking') => {
    const player = playerRef.current;
    if (!player) return;
    const mic = askForMic();
    mic.catch(() => {});
    void hands.start(player.context, mic, first);
  };
  useEffect(() => {
    // The mic's end handler outlives the render that started it; it sends through here.
    sendRef.current = sendLine;
  });

  const knock = () => {
    if (busy) return;
    // iOS only plays sound a tap started: the audio element and the phone's voice are both unlocked here.
    if (talk) {
      unlockAudio();
      // Knock or ring, at random: it says nothing about who answers.
      playerRef.current?.effect(Math.random() < 0.5 ? 'knock' : 'doorbell');
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
      // Opened while the door is answered, so the first words aren't lost to the connection starting.
      if (handsFree) startHandsFree('thinking');
    }
    setNotice('');
    deliveryRef.current = noDelivery();
    const next: Session = {
      sessionId: null,
      pick: canPick ? choice : 'surprise',
      turns: [],
      ended: false,
      feedback: null,
    };
    save(next);
    void requestTurn(next);
  };

  const end = () => {
    if (!session || busy) return;
    stopSpeaking();
    stopListening(false);
    hands.stop();
    if (!session.turns.some((turn) => turn.role === 'rep')) {
      reset();
      return;
    }
    const next: Session = { ...session, ended: true, endedBy: 'rep' };
    // The rep walks off: the door shuts behind them.
    if (talk) playerRef.current?.closeDoor(session.ring ? null : 'door-close');
    save(next);
    void requestFeedback(next);
  };

  /**
   * The practice order screen: the server hands over this door's card only
   * now, it goes into the conversation, and the homeowner reacts to it.
   */
  const pullUpPrice = async () => {
    if (!session?.sessionId || session.ended || busy) return;
    stopSpeaking();
    if (talk) unlockAudio();
    setBusy('turn');
    const result = await post<PracticePriceReply>({ action: 'price', sessionId: session.sessionId });
    if (!result.ok || !result.data.card) {
      setBusy(null);
      setNotice(result.ok ? "The price didn't come up. Try again." : result.error);
      return;
    }
    const next: Session = { ...session, turns: [...session.turns, { role: 'screen', text: result.data.card }] };
    save(next);
    await requestTurn(next);
  };

  /**
   * "Redo that moment": the same door again, up to the line that went worst,
   * as a new short practice. With Talk on, the homeowner's last words play
   * again so the rep can answer them.
   */
  const redo = async () => {
    const logId = session?.feedback?.id;
    if (!logId || busy) return;
    stopSpeaking();
    playerRef.current?.quiet();
    if (talk) unlockAudio();
    if (handsFree) startHandsFree('thinking');
    setBusy('redo');
    setFailed(null);
    const result = await post<PracticeRedoReply>({ action: 'redo', logId });
    setBusy(null);
    if (!result.ok || !result.data.sessionId || !Array.isArray(result.data.history) || !result.data.history.length) {
      hands.stop();
      setFailed({ message: result.ok ? "That didn't go through. Try again." : result.error, retry: null });
      return;
    }
    const { sessionId, history, ring, ambient } = result.data;
    deliveryRef.current = noDelivery();
    const next: Session = {
      sessionId,
      pick: 'surprise',
      turns: history,
      ended: false,
      feedback: null,
      ring: ring === true,
      ambient: ambient ?? null,
      redoFrom: history.length,
    };
    setDraft('');
    setNotice('');
    save(next);
    scrollDown('smooth');
    const player = playerRef.current;
    if (!talk || !player) {
      hands.listen();
      return;
    }
    let from = history.length;
    while (from > 0 && history[from - 1].role === 'customer') from -= 1;
    const lines: PracticeLine[] = history.slice(from).map((turn) => ({
      speaker: turn.speaker ?? 'homeowner',
      text: turn.text,
    }));
    const quiet = speechRef.current;
    player.setRing(next.ring === true);
    if (!next.ring) player.ambient(next.ambient ?? null);
    const first = lines.length ? await openVoice(sessionId, lines[0].text) : null;
    if (first && speechRef.current === quiet) void speakLines(player, first, lines, next, null);
    else {
      void first?.reader.cancel().catch(() => {});
      hands.listen();
    }
  };

  const reset = () => {
    stopSpeaking();
    playerRef.current?.quiet();
    stopListening(false);
    hands.stop();
    deliveryRef.current = null;
    save(null);
    setChoice('surprise');
    setDraft('');
    setNotice('');
    setFailed(null);
  };

  const retry = () => {
    if (!session || !failed?.retry) return;
    if (talk) unlockAudio();
    if (failed.retry === 'feedback') void requestFeedback(session);
    else if (failed.retry === 'turn') void requestTurn(session);
    else sendLine(draft);
  };

  const listen = () => {
    const Recognition = recognitionClass();
    if (!Recognition || busy || recognitionRef.current) return;
    stopSpeaking();
    setNotice('');
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    heardRef.current = '';
    skipSendRef.current = false;
    spokenRef.current = null;
    // From the mic's first words to its last: how long the rep spoke the line.
    let firstAt = 0;
    let lastAt = 0;
    const armSilence = (ms: number) => {
      clearSilence();
      silenceRef.current = window.setTimeout(() => recognition.stop(), ms);
    };
    recognition.onresult = (event) => {
      let heard = '';
      for (let i = 0; i < event.results.length; i += 1) heard += event.results[i][0]?.transcript ?? '';
      heardRef.current = heard.trim();
      setDraft(heardRef.current);
      lastAt = performance.now();
      if (!firstAt) firstAt = lastAt;
      armSilence(SILENCE_MS);
    };
    recognition.onerror = (event) => {
      skipSendRef.current = true;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        setMicBroken(true);
        setNotice("The mic isn't available here. Type instead, or use the keyboard's mic.");
      } else if (event.error === 'no-speech') {
        setNotice("Didn't catch that — tap to try again.");
      } else if (event.error !== 'aborted') {
        setNotice('Voice stopped. Check what was heard, then tap Send.');
      }
    };
    recognition.onend = () => {
      clearSilence();
      recognitionRef.current = null;
      setListening(false);
      if (skipSendRef.current) return;
      if (heardRef.current) {
        spokenRef.current = { text: heardRef.current, ms: Math.max(MIN_LINE_MS, Math.round(lastAt - firstAt)) };
        sendRef.current(heardRef.current);
      }
      else setNotice("Didn't catch that — tap to try again.");
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      armSilence(FIRST_WORD_MS);
    } catch {
      recognitionRef.current = null;
      setMicBroken(true);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendLine(draft);
  };

  const talkToggle = canSpeak ? (
    <div className={pr.bar}>
      <button
        type="button"
        className={`${s.btnSecondary} ${pr.talk}`}
        aria-pressed={talk}
        onClick={() => {
          if (talk) {
            stopSpeaking();
            stopListening(false);
            hands.stop();
          }
          setTalkOff(talk);
          try {
            if (talk) window.localStorage.setItem(TALK_PREF_KEY, 'off');
            else window.localStorage.removeItem(TALK_PREF_KEY);
          } catch {
            // Storage blocked: the choice holds for this visit only.
          }
        }}
      >
        {talk ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
        {talk ? 'Talk on' : 'Talk off'}
      </button>
      {talk && canHandsFreeHere ? (
        <button
          type="button"
          className={`${s.btnSecondary} ${pr.talk}`}
          aria-pressed={handsFree}
          onClick={() => {
            const on = !handsFree;
            setHandsFreeOn(on);
            try {
              if (on) window.localStorage.setItem(HANDS_FREE_PREF_KEY, 'on');
              else window.localStorage.removeItem(HANDS_FREE_PREF_KEY);
            } catch {
              // Storage blocked: the choice holds for this visit only.
            }
            if (!on) {
              hands.stop();
              return;
            }
            // Turned on mid-practice: the mic opens now, in this tap.
            if (session?.sessionId && !session.ended) {
              stopListening(false);
              unlockAudio();
              startHandsFree(busy ? 'thinking' : 'listening');
            }
          }}
        >
          <AudioLines size={18} aria-hidden="true" />
          Hands-free
        </button>
      ) : null}
    </div>
  ) : null;

  if (!session) {
    return (
      <>
        {talkToggle}
        {canPick ? (
          <section className={s.panel} aria-labelledby="practice-pick-h">
            <div className={pr.picker}>
              <h2 id="practice-pick-h" className={s.kicker}>
                Who&apos;s behind the door?
              </h2>
              <p className={p.hint}>Owners only: pick one to demo it. Reps always get a surprise.</p>
              <div className={pr.personas} role="group" aria-label="Homeowner">
                <button
                  type="button"
                  className={pr.persona}
                  aria-pressed={choice === 'surprise'}
                  onClick={() => setChoice('surprise')}
                >
                  <strong>
                    <Shuffle size={16} aria-hidden="true" /> Surprise me
                  </strong>
                  <span>What reps get. You find out who at the end.</span>
                </button>
                {PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    className={pr.persona}
                    aria-pressed={choice === persona.id}
                    onClick={() => setChoice(persona.id)}
                  >
                    <strong>{persona.label}</strong>
                    <span>{persona.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}
        <div className={`${s.panel} ${a.composer}`}>
          <button type="button" className={`${s.btnPrimary} ${pr.knock}`} onClick={knock}>
            <DoorOpen size={22} aria-hidden="true" />
            Knock
          </button>
          {notice ? (
            <p className={`${p.hint} ${p.hintError} ${pr.center}`} role="alert">
              {notice}
            </p>
          ) : null}
          <p className={`${p.hint} ${pr.center}`}>
            Someone different answers each time. Pitch it like a real door; you find out who it was in your feedback.
          </p>
        </div>
        <PracticeMine />
        <div ref={bottomRef} className={pr.anchor} aria-hidden="true" />
      </>
    );
  }

  const repSpoke = session.turns.some((turn) => turn.role === 'rep');
  const pricePulled = session.turns.some((turn) => turn.role === 'screen');
  const atCap = session.turns.length >= MAX_PRACTICE_TURNS - 1;
  const handsOn = hands.status !== 'off' && !session.ended && !atCap;
  const micShown = talk && canListen && !micBroken && !session.ended && !atCap && !handsOn;

  return (
    <>
      {talkToggle}
      <ol className={a.thread} aria-live="polite" aria-label="Practice conversation">
        {session.turns.flatMap((turn, index) => [
          index === session.redoFrom ? (
            <li key={`redo-${index}`} className={pr.redoMark}>
              Your redo starts here
            </li>
          ) : null,
          turn.role === 'screen' ? (
            <li key={index} className={pr.screen}>
              <MonitorSmartphone size={18} aria-hidden="true" />
              <p>{turn.text}</p>
            </li>
          ) : turn.role === 'rep' ? (
            <li key={index} className={a.question}>
              <p className={a.questionText}>{turn.text}</p>
            </li>
          ) : (
            <li key={index} className={pr.customer}>
              <span className={pr.speaker}>{speakerLabel(turn, session.ring === true)}</span>
              <p className={`${a.answer} ${a.answerText} ${pr.line}`}>{turn.text}</p>
            </li>
          ),
        ])}
        {session.redoFrom === session.turns.length ? <li className={pr.redoMark}>Your redo starts here</li> : null}
        {busy === 'turn' ? (
          <li className={pr.customer}>
            <span className={pr.speaker}>Homeowner</span>
            <p className={`${a.answer} ${a.pending}`} role="status" aria-label="The homeowner is answering">
              <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden="true" />
            </p>
          </li>
        ) : null}
      </ol>

      {session.ended ? (
        <div className={pr.after}>
          <p className={pr.over}>Session over</p>
          {session.feedback || busy === 'feedback' ? (
            <BorderBeam size="md" active={busy === 'feedback' && !reducedMotion} theme="dark" className={pr.feedbackBeam}>
              {session.feedback ? (
                <section className={`${s.panel} ${pr.feedback}`} aria-labelledby="practice-feedback-h">
                  <div className={pr.feedbackHead}>
                    <h2 id="practice-feedback-h" className={s.kicker}>
                      Feedback
                    </h2>
                    {session.feedback.score !== null ? (
                      <span className={pr.score}>{session.feedback.score}/10</span>
                    ) : null}
                  </div>
                  <PracticeFeedback text={session.feedback.text} />
                  {session.delivery ? <p className={pr.delivery}>{deliveryLine(session.delivery)}</p> : null}
                </section>
              ) : (
                <section className={`${s.panel} ${pr.feedback}`} aria-busy="true">
                  <p className={pr.thinking} role="status">
                    <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden="true" />
                    Thinking…
                  </p>
                </section>
              )}
            </BorderBeam>
          ) : failed ? null : (
            <button type="button" className={`${s.btnSecondary} ${a.retry}`} onClick={() => void requestFeedback(session)}>
              Get feedback
            </button>
          )}
          {failed ? (
            <div className={a.failed} role="alert">
              <p>{failed.message}</p>
              {failed.retry ? (
                <button type="button" className={`${s.btnSecondary} ${a.retry}`} onClick={retry}>
                  <RotateCw size={18} aria-hidden="true" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {session.feedback?.canRedo && session.feedback.id ? (
            <button type="button" className={`${s.btnSecondary} ${pr.knock}`} onClick={() => void redo()} disabled={busy !== null}>
              <Undo2 size={20} aria-hidden="true" />
              {busy === 'redo' ? 'Going back…' : 'Redo that moment'}
            </button>
          ) : null}
          {session.feedback || failed ? (
            <button type="button" className={`${s.btnPrimary} ${pr.knock}`} onClick={reset} disabled={busy === 'redo'}>
              <RotateCw size={20} aria-hidden="true" />
              Practice again
            </button>
          ) : null}
        </div>
      ) : (
        <form className={`${s.panel} ${a.composer}`} onSubmit={onSubmit}>
          {failed ? (
            <div className={a.failed} role="alert">
              <p>{failed.message}</p>
              {failed.retry ? (
                <button type="button" className={`${s.btnSecondary} ${a.retry}`} onClick={retry} disabled={busy !== null}>
                  <RotateCw size={18} aria-hidden="true" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {handsOn ? (
            hands.status === 'paused' ? (
              <button type="button" className={pr.mic} onClick={() => startHandsFree(busy ? 'thinking' : 'listening')}>
                <Mic size={26} aria-hidden="true" />
                Hands-free paused. Tap to go on
              </button>
            ) : (
              <div className={pr.handsFree} role="status" aria-live="polite">
                {hands.status === 'listening' ? (
                  <ThinkingOrb state="listening" size={20} theme="dark" aria-hidden="true" />
                ) : hands.status === 'thinking' || hands.status === 'starting' ? (
                  <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden="true" />
                ) : (
                  <AudioLines size={20} aria-hidden="true" />
                )}
                <span>
                  {hands.status === 'starting'
                    ? 'Starting the mic…'
                    : hands.status === 'listening'
                      ? hands.heard || 'Listening. Just talk.'
                      : hands.status === 'speaking'
                        ? 'Homeowner talking. Talk over them to cut in.'
                        : '…'}
                </span>
              </div>
            )
          ) : null}
          {micShown ? (
            <button
              type="button"
              className={pr.mic}
              aria-pressed={listening}
              disabled={busy !== null && !listening}
              onClick={() => (listening ? stopListening(true) : listen())}
            >
              {listening ? (
                <ThinkingOrb state="listening" size={20} theme="light" aria-hidden="true" />
              ) : (
                <Mic size={26} aria-hidden="true" />
              )}
              {listening ? 'Listening… tap to send' : 'Tap to talk'}
            </button>
          ) : null}
          {atCap ? (
            <p className={p.hint}>That&apos;s as long as a practice runs. Get your feedback.</p>
          ) : (
            <>
              <label htmlFor="practice-line" className={s.srOnly}>
                What you say
              </label>
              <textarea
                id="practice-line"
                className={`${p.input} ${p.textarea} ${pr.input}`}
                placeholder={micShown ? 'Or type what you say' : 'What do you say?'}
                value={draft}
                maxLength={MAX_REP_CHARS}
                rows={2}
                enterKeyHint="send"
                readOnly={listening}
                onChange={(event) => {
                  stopSpeaking();
                  setDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) sendLine(draft);
                }}
              />
            </>
          )}
          {notice ? (
            <p className={`${p.hint} ${p.hintError}`} role="alert">
              {notice}
            </p>
          ) : null}
          <div className={a.actions}>
            {atCap ? (
              <button type="button" className={`${s.btnPrimary} ${pr.knock}`} onClick={end} disabled={busy !== null}>
                End &amp; get feedback
              </button>
            ) : (
              <>
                {/* Icon over a one-word label, so End, Price and Send fit a 360px phone. */}
                <button
                  type="button"
                  className={`${s.btnSecondary} ${pr.sideBtn}`}
                  aria-label={repSpoke ? 'End and get feedback' : 'Leave'}
                  onClick={end}
                  disabled={busy !== null}
                >
                  <DoorClosed size={20} aria-hidden="true" />
                  {repSpoke ? 'End' : 'Leave'}
                </button>
                <button
                  type="button"
                  className={`${s.btnSecondary} ${pr.sideBtn}`}
                  aria-label={pricePulled ? 'Price is up' : 'Pull up price'}
                  onClick={() => void pullUpPrice()}
                  disabled={busy !== null || pricePulled || !session.sessionId}
                >
                  <MonitorSmartphone size={20} aria-hidden="true" />
                  Price
                </button>
              </>
            )}
            {atCap ? null : (
              <button
                type="submit"
                className={`${s.btnPrimary} ${a.sendBtn}`}
                disabled={busy !== null || listening || !draft.trim()}
              >
                <SendHorizontal size={20} aria-hidden="true" />
                Send
              </button>
            )}
          </div>
        </form>
      )}
      <div ref={bottomRef} className={pr.anchor} aria-hidden="true" />
    </>
  );
}
