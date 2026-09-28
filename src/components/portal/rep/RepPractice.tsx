'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { DoorClosed, DoorOpen, Mic, MonitorSmartphone, RotateCw, SendHorizontal, Shuffle, Volume2, VolumeX } from 'lucide-react';
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
  type PracticeFeedbackReply,
  type PracticeKnockReply,
  type PracticePriceReply,
  type PracticeTurn,
  type PracticeTurnReply,
} from '@/lib/ask/practice';
import { pickVoice, spokenText } from '@/lib/ask/practiceVoice';
import s from './rep.module.css';
import p from './rep-page.module.css';
import a from './rep-ask.module.css';
import pr from './rep-practice.module.css';
import { PracticeFeedback } from './PracticeFeedback';

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
// The session lives in sessionStorage under its own key, tagged with the uid,
// with the same idle reset as Ask.

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
  feedback: { text: string; score: number | null } | null;
}

interface StoredSession extends Session {
  uid: string;
  lastAt: number;
}

type Busy = 'turn' | 'feedback' | null;
/** null: nothing to retry today (the daily limit). */
type Retry = 'turn' | 'send' | 'feedback' | null;

const REQUEST_TIMEOUT_MS = 60_000;
/** The server gives the voice 10 s; past this the phone's own voice reads the line. */
const VOICE_TIMEOUT_MS = 12_000;
/** A tiny silent WAV: played inside the Knock tap so iOS lets the same element play later lines. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
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
      turns: raw.turns.filter(
        (turn) =>
          turn && (turn.role === 'rep' || turn.role === 'customer' || turn.role === 'screen') && typeof turn.text === 'string'
      ),
      ended: raw.ended === true,
      endedBy: raw.endedBy === 'homeowner' || raw.endedBy === 'rep' ? raw.endedBy : undefined,
      feedback: raw.feedback && typeof raw.feedback.text === 'string' ? raw.feedback : null,
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

/** The homeowner's latest line in the session's voice, or null (the phone's own voice reads it then). */
async function fetchVoice(sessionId: string, text: string): Promise<Blob | null> {
  try {
    const token = await getIdToken();
    const res = await fetch('/api/portal/ask/practice/voice', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text }),
      signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
    });
    const blob = res.ok ? await res.blob() : null;
    return blob && blob.size > 44 ? blob : null;
  } catch {
    return null;
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
  const reducedMotion = usePrefersReducedMotion();
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const heardRef = useRef('');
  const skipSendRef = useRef(false);
  const silenceRef = useRef<number | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});
  /** The one audio element every spoken line plays through (unlocked by a tap, reused). */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  /** Bumped whenever speech should stop: a voice that arrives after that stays quiet. */
  const speechRef = useRef(0);

  const canSpeak = useSyncExternalStore(noSubscribe, () => 'speechSynthesis' in window, () => false);
  const canListen = useSyncExternalStore(noSubscribe, () => recognitionClass() !== undefined, () => false);
  const talk = canSpeak && !talkOff;

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
    audioRef.current?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  /**
   * Inside a tap: play a silent clip on the audio element so iOS lets it play
   * the homeowner's voice later, after an await. Once is enough.
   */
  const unlockAudio = () => {
    if (audioRef.current || typeof Audio === 'undefined') return;
    const audio = new Audio();
    audioRef.current = audio;
    audio.src = SILENT_WAV;
    void audio.play()?.catch(() => {});
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
    stopListening(false);
  }, [active, stopListening, stopSpeaking]);

  useEffect(() => {
    // Some browsers load their voices late; asking once starts that.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    return () => {
      stopSpeaking();
      recognitionRef.current?.abort();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [stopSpeaking]);

  useEffect(() => {
    // Back from the background: quiet, and after the idle window a fresh start.
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        stopSpeaking();
        stopListening(false);
        return;
      }
      setSession((current) => (current && !readStoredPractice(uid) ? null : current));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, stopListening, stopSpeaking]);

  const save = (next: Session | null) => {
    setSession(next);
    storeSession(uid, next);
  };

  /** The phone's own voice, when the session's voice didn't come through. Generic on purpose: it says nothing about who this is. */
  const speakFallback = (line: string) => {
    const text = spokenText(line);
    if (!text || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    const voice = pickVoice(synth.getVoices(), null, 0);
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  };

  /** Plays the homeowner's voice through the unlocked element; the phone's voice if it won't play. */
  const play = (voice: Blob, line: string) => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = URL.createObjectURL(voice);
    audio.setAttribute('src', audioUrlRef.current);
    const started = audio.play();
    if (started) started.catch(() => speakFallback(line));
  };

  const requestFeedback = async (current: Session) => {
    setBusy('feedback');
    setFailed(null);
    scrollDown('smooth');
    const result = await post<PracticeFeedbackReply>({
      action: 'feedback',
      sessionId: current.sessionId,
      history: current.turns,
      endedBy: current.endedBy ?? 'rep',
    });
    setBusy(null);
    if (result.ok && result.data.feedback) {
      save({ ...current, ended: true, feedback: { text: result.data.feedback, score: result.data.score } });
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
    if (result.ok && result.data.reply && (!knocked || result.data.sessionId)) {
      const { reply, ended } = result.data;
      const next: Session = {
        ...current,
        ...(knocked ? { sessionId: result.data.sessionId ?? null } : {}),
        turns: [...current.turns, { role: 'customer', text: reply }],
        ended,
        endedBy: ended ? 'homeowner' : undefined,
      };
      const voice = talk && next.sessionId ? await fetchVoice(next.sessionId, reply) : null;
      setBusy(null);
      save(next);
      // The rep started talking or typing meanwhile: the line shows, unspoken.
      if (talk && speechRef.current === quiet) {
        if (voice) play(voice, reply);
        else speakFallback(reply);
      }
      scrollDown('smooth');
      if (ended) await requestFeedback(next);
      return;
    }
    setBusy(null);
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
    const next: Session = { ...session, turns: [...session.turns, { role: 'rep', text }] };
    save(next);
    void requestTurn(next);
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
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
    setNotice('');
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
    if (!session.turns.some((turn) => turn.role === 'rep')) {
      reset();
      return;
    }
    const next: Session = { ...session, ended: true, endedBy: 'rep' };
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

  const reset = () => {
    stopSpeaking();
    stopListening(false);
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
    const armSilence = (ms: number) => {
      clearSilence();
      silenceRef.current = window.setTimeout(() => recognition.stop(), ms);
    };
    recognition.onresult = (event) => {
      let heard = '';
      for (let i = 0; i < event.results.length; i += 1) heard += event.results[i][0]?.transcript ?? '';
      heardRef.current = heard.trim();
      setDraft(heardRef.current);
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
      if (heardRef.current) sendRef.current(heardRef.current);
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
        <div ref={bottomRef} className={pr.anchor} aria-hidden="true" />
      </>
    );
  }

  const repSpoke = session.turns.some((turn) => turn.role === 'rep');
  const pricePulled = session.turns.some((turn) => turn.role === 'screen');
  const atCap = session.turns.length >= MAX_PRACTICE_TURNS - 1;
  const micShown = talk && canListen && !micBroken && !session.ended && !atCap;

  return (
    <>
      {talkToggle}
      <ol className={a.thread} aria-live="polite" aria-label="Practice conversation">
        {session.turns.map((turn, index) =>
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
              <span className={pr.speaker}>Homeowner</span>
              <p className={`${a.answer} ${a.answerText} ${pr.line}`}>{turn.text}</p>
            </li>
          )
        )}
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
          {session.feedback || failed ? (
            <button type="button" className={`${s.btnPrimary} ${pr.knock}`} onClick={reset}>
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
