'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { DoorOpen, Mic, RotateCw, SendHorizontal, Shuffle, Volume2, VolumeX } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ASK_IDLE_RESET_MS } from '@/lib/ask/chat';
import {
  MAX_PRACTICE_TURNS,
  MAX_REP_CHARS,
  PERSONAS,
  PRACTICE_SESSION_KEY,
  isPersonaChoice,
  isPracticeSeed,
  practiceCustomer,
  type PersonaChoice,
  type PracticeFeedbackReply,
  type PracticeTurn,
  type PracticeTurnReply,
} from '@/lib/ask/practice';
import { pickVoice, spokenText } from '@/lib/ask/practiceVoice';
import s from './rep.module.css';
import p from './rep-page.module.css';
import a from './rep-ask.module.css';
import pr from './rep-practice.module.css';

// Ask 3C Practice: the rep picks who is behind the door, knocks, and pitches;
// the homeowner (the model) answers until the door closes, they sign up, or
// the rep ends it, then a coach grades the pitch (POST /api/portal/ask/practice).
// Talk mode reads the homeowner aloud (speechSynthesis) and takes the rep's
// lines by voice (SpeechRecognition), all on the phone; typing always works.
// The session lives in sessionStorage under its own key, tagged with the uid,
// with the same idle reset as Ask.

interface Session {
  persona: PersonaChoice;
  seed: number;
  turns: PracticeTurn[];
  /** The homeowner closed the door or signed up, or the rep ended it. */
  ended: boolean;
  feedback: { text: string; score: number | null } | null;
}

interface StoredSession extends Session {
  uid: string;
  lastAt: number;
}

type Busy = 'turn' | 'feedback' | null;
type Retry = 'turn' | 'send' | 'feedback';

const REQUEST_TIMEOUT_MS = 45_000;
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
      !isPersonaChoice(raw.persona) ||
      !isPracticeSeed(raw.seed) ||
      !Array.isArray(raw.turns) ||
      typeof raw.lastAt !== 'number' ||
      Date.now() - raw.lastAt > ASK_IDLE_RESET_MS
    ) {
      window.sessionStorage.removeItem(PRACTICE_SESSION_KEY);
      return null;
    }
    return {
      persona: raw.persona,
      seed: raw.seed,
      turns: raw.turns.filter((turn) => turn && (turn.role === 'rep' || turn.role === 'customer') && typeof turn.text === 'string'),
      ended: raw.ended === true,
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

async function post<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
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
    return { ok: false, error: json.error || "That didn't go through. Try again." };
  } catch {
    return { ok: false, error: 'Nothing came back. Check your signal and try again.' };
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

function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function RepPractice({ uid, active, onResume }: { uid: string; active: boolean; onResume: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [choice, setChoice] = useState<PersonaChoice | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState<{ message: string; retry: Retry } | null>(null);
  const [notice, setNotice] = useState('');
  const [talkOff, setTalkOff] = useState(false);
  const [listening, setListening] = useState(false);
  const [micBroken, setMicBroken] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const heardRef = useRef('');
  const skipSendRef = useRef(false);
  const silenceRef = useRef<number | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

  const canSpeak = useSyncExternalStore(noSubscribe, () => 'speechSynthesis' in window, () => false);
  const canListen = useSyncExternalStore(noSubscribe, () => recognitionClass() !== undefined, () => false);
  const talk = canSpeak && !talkOff;
  const customer = useMemo(() => (session ? practiceCustomer(session.persona, session.seed) : null), [session]);

  const scrollDown = useCallback((behavior: ScrollBehavior) => {
    window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior }));
  }, []);

  const clearSilence = () => {
    if (silenceRef.current !== null) window.clearTimeout(silenceRef.current);
    silenceRef.current = null;
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
  }, [active, stopListening]);

  useEffect(() => {
    // Some browsers load their voices late; asking once starts that.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    return () => {
      stopSpeaking();
      recognitionRef.current?.abort();
    };
  }, []);

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
  }, [uid, stopListening]);

  const save = (next: Session | null) => {
    setSession(next);
    storeSession(uid, next);
  };

  /** Reads a homeowner line aloud in this session's voice (Talk on only). */
  const speak = (line: string, current: Session) => {
    const text = spokenText(line);
    if (!talk || !text) return;
    const speaker = practiceCustomer(current.persona, current.seed);
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    const voice = pickVoice(synth.getVoices(), speaker.gender, current.seed);
    if (voice) utterance.voice = voice;
    utterance.pitch = speaker.voice.pitch;
    utterance.rate = speaker.voice.rate;
    synth.speak(utterance);
  };

  const requestFeedback = async (current: Session) => {
    setBusy('feedback');
    setFailed(null);
    scrollDown('smooth');
    const result = await post<PracticeFeedbackReply>({
      action: 'feedback',
      persona: current.persona,
      seed: current.seed,
      history: current.turns,
    });
    setBusy(null);
    if (result.ok && result.data.feedback) {
      save({ ...current, ended: true, feedback: { text: result.data.feedback, score: result.data.score } });
    } else {
      setFailed({ message: result.ok ? 'No feedback came back. Try again.' : result.error, retry: 'feedback' });
    }
    scrollDown('smooth');
  };

  /** The homeowner's next line: the door opening (no turns yet) or the answer to the rep's last line. */
  const requestTurn = async (current: Session) => {
    setBusy('turn');
    setFailed(null);
    scrollDown('smooth');
    const result = await post<PracticeTurnReply>({
      action: 'turn',
      persona: current.persona,
      seed: current.seed,
      history: current.turns,
    });
    setBusy(null);
    if (result.ok && result.data.reply) {
      const { reply, ended } = result.data;
      const next: Session = { ...current, turns: [...current.turns, { role: 'customer', text: reply }], ended };
      save(next);
      speak(reply, next);
      scrollDown('smooth');
      if (ended) await requestFeedback(next);
      return;
    }
    const error = result.ok ? 'The homeowner went quiet. Try again.' : result.error;
    const last = current.turns.at(-1);
    if (last?.role === 'rep') {
      // Nothing to show for it: the line goes back in the composer, ready for Try again.
      save({ ...current, turns: current.turns.slice(0, -1) });
      setDraft(last.text);
      setFailed({ message: error, retry: 'send' });
    } else {
      setFailed({ message: error, retry: 'turn' });
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
    if (!choice || busy) return;
    // iOS only lets a page speak after a tap has spoken once: this silent line is that.
    if (talk) {
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
    const seed = window.crypto.getRandomValues(new Uint32Array(1))[0];
    const next: Session = { persona: choice, seed, turns: [], ended: false, feedback: null };
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
    const next = { ...session, ended: true };
    save(next);
    void requestFeedback(next);
  };

  const reset = () => {
    stopSpeaking();
    stopListening(false);
    save(null);
    setChoice(null);
    setDraft('');
    setNotice('');
    setFailed(null);
  };

  const retry = () => {
    if (!session || !failed) return;
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
        setNotice("Didn't catch that. Tap the mic and try again.");
      } else if (event.error !== 'aborted') {
        setNotice('Voice stopped. Check what was heard, then tap Send.');
      }
    };
    recognition.onend = () => {
      clearSilence();
      recognitionRef.current = null;
      setListening(false);
      if (!skipSendRef.current && heardRef.current) sendRef.current(heardRef.current);
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
        <section className={s.panel} aria-labelledby="practice-pick-h">
          <div className={pr.picker}>
            <h2 id="practice-pick-h" className={s.kicker}>
              Who&apos;s behind the door?
            </h2>
            <div className={pr.personas} role="group" aria-label="Homeowner">
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
              <button
                type="button"
                className={pr.persona}
                aria-pressed={choice === 'surprise'}
                onClick={() => setChoice('surprise')}
              >
                <strong>
                  <Shuffle size={16} aria-hidden="true" /> Surprise me
                </strong>
                <span>Any of them. You find out who at the end.</span>
              </button>
            </div>
          </div>
        </section>
        <div className={`${s.panel} ${a.composer}`}>
          <button type="button" className={`${s.btnPrimary} ${pr.knock}`} disabled={!choice} onClick={knock}>
            <DoorOpen size={22} aria-hidden="true" />
            Knock
          </button>
          <p className={`${p.hint} ${pr.center}`}>
            {choice ? 'Pitch it like a real door. End it anytime for feedback.' : 'Pick a homeowner first.'}
          </p>
        </div>
        <div ref={bottomRef} className={pr.anchor} aria-hidden="true" />
      </>
    );
  }

  const repSpoke = session.turns.some((turn) => turn.role === 'rep');
  const atCap = session.turns.length >= MAX_PRACTICE_TURNS - 1;
  const micShown = talk && canListen && !micBroken && !session.ended && !atCap;

  return (
    <>
      {talkToggle}
      <ol className={a.thread} aria-live="polite" aria-label="Practice conversation">
        {session.turns.map((turn, index) =>
          turn.role === 'rep' ? (
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
              …
            </p>
          </li>
        ) : null}
      </ol>

      {session.ended ? (
        <div className={pr.after}>
          <p className={pr.over}>Session over</p>
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
              <p className={pr.feedbackText}>{session.feedback.text}</p>
              {customer ? (
                <p className={p.hint}>
                  You were talking to: {customer.persona.label} ({customer.name}).
                </p>
              ) : null}
            </section>
          ) : busy === 'feedback' ? (
            <p className={`${a.answer} ${a.pending}`} role="status">
              Thinking…
            </p>
          ) : null}
          {failed ? (
            <div className={a.failed} role="alert">
              <p>{failed.message}</p>
              <button type="button" className={`${s.btnSecondary} ${a.retry}`} onClick={retry}>
                <RotateCw size={18} aria-hidden="true" />
                Try again
              </button>
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
              <button type="button" className={`${s.btnSecondary} ${a.retry}`} onClick={retry} disabled={busy !== null}>
                <RotateCw size={18} aria-hidden="true" />
                Try again
              </button>
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
              <Mic size={26} aria-hidden="true" />
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
            <button type="button" className={`${s.btnSecondary} ${pr.endBtn}`} onClick={end} disabled={busy !== null}>
              {repSpoke ? 'End & get feedback' : 'Leave'}
            </button>
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
