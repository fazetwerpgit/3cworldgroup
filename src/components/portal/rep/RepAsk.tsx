'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, MessageCircleQuestion, RotateCw, SendHorizontal, SquarePen, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { BorderBeam } from 'border-beam';
import { ThinkingOrb } from 'thinking-orbs';
import { useAuth } from '@/contexts/AuthContext';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useKeepAboveKeyboard } from '@/hooks/useKeyboardInset';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { askOpenTo, practiceOpenTo } from '@/lib/ask/flag';
import { isOwner } from '@/types';
import {
  ASK_CONVERSATION_KEY,
  ASK_HISTORY_TURNS,
  ASK_IDLE_RESET_MS,
  MAX_QUESTION_CHARS,
  answerLines,
  type AskReply,
  type AskTurnMessage,
} from '@/lib/ask/chat';
import { FormUploadError, prepareFormFile } from '@/lib/forms/uploadFormAttachment';
import { isAiConsentRefusal } from '@/lib/ai/consent';
import { fetchAiConsent } from '@/lib/ai/consentClient';
import s from './rep.module.css';
import p from './rep-page.module.css';
import a from './rep-ask.module.css';
import { RepPractice } from './RepPractice';
import { AiConsentSheet } from './AiConsentSheet';
import { isComposerSend } from './composerKeys';

// Ask 3C: a rep at a customer's door asks what to do; the answer comes from
// the owner's knowledge notes only (POST /api/portal/ask). One conversation per
// browser session: the last turns live in sessionStorage, tagged with the rep's
// uid (sign-out clears it; another uid's conversation is dropped), and go back
// with each question so a follow-up has context. Photos are never kept.
// The Practice tab (RepPractice) sits beside it; both stay mounted so a reply
// in flight lands even if the rep switches tabs.

interface Turn {
  key: string;
  question: string;
  hadPhoto: boolean;
  /** This session's preview of the attached photo (not persisted). */
  photoUrl?: string;
  /** The askLog id, for the thumbs. */
  id?: string;
  answer?: string;
  rating?: 'up' | 'down' | null;
  /** The last thumbs did not save. */
  rateFailed?: boolean;
}

/** What sessionStorage holds: one rep's conversation and when it was last used. */
interface StoredConversation {
  uid: string;
  turns: Turn[];
  lastAt: number;
}

const REQUEST_TIMEOUT_MS = 45_000;
// HEIC is taken and turned into a JPEG on the phone (Safari decodes it); the
// model reads JPEG, PNG and WebP.
const PHOTO_PICK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PHOTO_SEND_TYPES: Record<string, true> = { 'image/jpeg': true, 'image/png': true, 'image/webp': true };

const EXAMPLES = [
  'The screen says the customer has reached the max number of lines. What do I do?',
  'A $100 deposit came up. What do I tell the customer?',
  'How do I call Sales Support?',
];

/** This rep's stored conversation, unless it went idle. Anyone else's (a shared phone) is thrown away. */
function readStored(uid: string): Turn[] {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(ASK_CONVERSATION_KEY) ?? 'null') as StoredConversation | null;
    if (
      !raw ||
      raw.uid !== uid ||
      !Array.isArray(raw.turns) ||
      typeof raw.lastAt !== 'number' ||
      Date.now() - raw.lastAt > ASK_IDLE_RESET_MS
    ) {
      window.sessionStorage.removeItem(ASK_CONVERSATION_KEY);
      return [];
    }
    return raw.turns.filter((turn) => turn && typeof turn.question === 'string' && typeof turn.answer === 'string');
  } catch {
    return [];
  }
}

function store(uid: string, turns: Turn[]) {
  try {
    const kept = turns
      .filter((turn) => turn.answer)
      .slice(-ASK_HISTORY_TURNS)
      .map((turn) => ({ ...turn, photoUrl: undefined, rateFailed: undefined }));
    window.sessionStorage.setItem(
      ASK_CONVERSATION_KEY,
      JSON.stringify({ uid, turns: kept, lastAt: Date.now() } satisfies StoredConversation)
    );
  } catch {
    // Private mode or a full quota: the conversation just won't survive a reload.
  }
}

/** The answered turns as the model's history (the last ASK_HISTORY_TURNS). */
function historyOf(turns: Turn[]): AskTurnMessage[] {
  return turns
    .filter((turn) => turn.answer)
    .slice(-ASK_HISTORY_TURNS)
    .flatMap((turn) => [
      { role: 'user' as const, text: turn.question || '(sent a photo)' },
      { role: 'assistant' as const, text: turn.answer ?? '' },
    ]);
}

function Answer({ text }: { text: string }) {
  return (
    <p className={a.answerText}>
      {answerLines(text).map((parts, line) => (
        <span key={line} className={a.line}>
          {parts.map((part, index) =>
            part.kind === 'phone' ? (
              <a key={index} href={`tel:${part.tel}`} className={a.link}>
                {part.text}
              </a>
            ) : part.kind === 'link' ? (
              <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className={a.link}>
                {part.text}
              </a>
            ) : (
              <span key={index}>{part.text}</span>
            )
          )}
        </span>
      ))}
    </p>
  );
}

type Mode = 'ask' | 'practice';

export function RepAsk() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [mode, setMode] = useState<Mode>('ask');
  const showPractice = useCallback(() => setMode('practice'), []);
  const canPractice = practiceOpenTo(user?.role);

  if (!askOpenTo(user?.role, user?.uid)) {
    return (
      <div className={p.page}>
        <header className={p.head}>
          <h1 className={p.title}>Ask 3C</h1>
        </header>
        <section className={s.panel}>
          <div className={p.empty}>
            <div>
              <strong>Ask 3C is not turned on yet.</strong>
              <p>It will show up here once it&apos;s on.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${p.page} ${a.page}`}>
      <header className={p.head}>
        <h1 className={p.title}>Ask 3C</h1>
        <p className={p.lede}>
          {mode === 'ask'
            ? 'Stuck on an order? Ask here. Prices and promos are always on the order screen.'
            : 'Pitch a homeowner at the door, then get coached on it.'}
        </p>
      </header>
      {canPractice && (
        <div className={p.tabs} role="group" aria-label="Ask 3C mode">
          <button type="button" className={p.tab} aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>
            Ask
          </button>
          <button type="button" className={p.tab} aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>
            Practice
          </button>
        </div>
      )}
      <div className={a.mode} hidden={mode !== 'ask'}>
        <AskChat uid={uid} />
      </div>
      {canPractice && (
        <div className={a.mode} hidden={mode !== 'practice'}>
          {/* A practice in progress (a reload mid-pitch) opens on Practice. */}
          <RepPractice uid={uid} active={mode === 'practice'} canPick={isOwner(user?.role ?? undefined)} onResume={showPractice} />
        </div>
      )}
    </div>
  );
}

function AskChat({ uid }: { uid: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  /** The last question got no answer; it is back in the composer. */
  // retry: false at the daily limit, where Try again would only hit it again.
  const [failed, setFailed] = useState<{ message: string; retry: boolean } | null>(null);
  const [fileKey, setFileKey] = useState(0);
  /** DeepSeek consent (lib/ai/consent): null until read. The route enforces it either way. */
  const [consented, setConsented] = useState<boolean | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  // After the keyboard spacer: scrolling to it shows the composer and the room the keyboard takes.
  const bottomRef = useRef<HTMLDivElement>(null);
  // The keyboard covers the bottom of the page: keep the composer above it.
  const { inset: keyboardInset } = useKeepAboveKeyboard(composerRef);
  const reducedMotion = usePrefersReducedMotion();

  /** Bring the whole composer into view by scrolling to the anchor after the keyboard spacer
   *  (the RepPractice pattern); its scroll margin keeps it above the phone tab bar. */
  const showComposer = useCallback((behavior: ScrollBehavior) => {
    window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior }));
  }, []);

  useEffect(() => {
    // Read once, so the consent sheet shows before the first question goes out.
    if (!uid) return;
    let live = true;
    void fetchAiConsent().then((state) => {
      if (live && state) setConsented(state.deepseek);
    });
    return () => {
      live = false;
    };
  }, [uid]);

  useEffect(() => {
    // Restored after mount (the server render has no sessionStorage), and
    // again if a different rep signs in on this phone.
    if (!uid) return;
    const restored = readStored(uid);
    setTurns(restored);
    if (restored.length > 0) showComposer('instant');
  }, [uid, showComposer]);

  useEffect(() => {
    // The app left open in the background: coming back after the idle window
    // starts a fresh chat, the same as reopening it.
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setTurns((current) => {
        if (current.length === 0 || current.some((turn) => !turn.answer)) return current;
        const restored = readStored(uid);
        if (restored.length > 0) return current;
        for (const turn of current) if (turn.photoUrl) URL.revokeObjectURL(turn.photoUrl);
        return [];
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid]);

  const update = (next: (current: Turn[]) => Turn[]) => {
    setTurns((current) => {
      const updated = next(current);
      store(uid, updated);
      return updated;
    });
  };

  const pickPhoto = async (file: File | undefined) => {
    setFileKey((key) => key + 1);
    if (!file) return;
    setNotice('');
    setPreparing(true);
    try {
      const prepared = await prepareFormFile(file, { allowedTypes: PHOTO_PICK_TYPES });
      if (!Object.hasOwn(PHOTO_SEND_TYPES, prepared.type)) {
        throw new FormUploadError("That photo type can't be read here. Take a screenshot and add that instead.");
      }
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ file: prepared, url: URL.createObjectURL(prepared) });
    } catch (error) {
      setNotice(error instanceof FormUploadError ? error.message : "That photo couldn't be added. Try another.");
    } finally {
      setPreparing(false);
    }
  };

  const send = async (event?: FormEvent, agreed = false) => {
    event?.preventDefault();
    const text = question.trim();
    if (sending || preparing || (!text && !photo)) return;
    if (text.length > MAX_QUESTION_CHARS) {
      setNotice(`Keep the question under ${MAX_QUESTION_CHARS} characters.`);
      return;
    }
    // Not agreed to DeepSeek yet: the sheet first; the question waits in the composer.
    if (consented === false && !agreed) {
      setConsentOpen(true);
      return;
    }
    const key = `${Date.now()}`;
    const history = historyOf(turns);
    const sentPhoto = photo;
    update((current) => [...current, { key, question: text, hadPhoto: !!sentPhoto, photoUrl: sentPhoto?.url }]);
    setQuestion('');
    setPhoto(null);
    setNotice('');
    setFailed(null);
    setSending(true);
    showComposer('smooth');

    let reply: AskReply | null = null;
    let error = 'No answer came back. Check your signal and try again.';
    let retry = true;
    let needsConsent = false;
    try {
      const form = new FormData();
      form.set('question', text);
      form.set('history', JSON.stringify(history));
      if (sentPhoto) form.set('photo', sentPhoto.file);
      const token = await getIdToken();
      const res = await fetch('/api/portal/ask', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<AskReply> & { error?: string };
      if (res.ok && json.answer && json.id) reply = { id: json.id, answer: json.answer };
      else if (isAiConsentRefusal(res.status, json)) needsConsent = true;
      else {
        error = json.error || "Ask 3C couldn't answer right now. Try again.";
        retry = res.status !== 429;
      }
    } catch {
      // The default message above: nothing came back.
    }
    if (reply) {
      const { id, answer } = reply;
      update((current) => current.map((turn) => (turn.key === key ? { ...turn, id, answer, rating: null } : turn)));
    } else {
      // Nothing to show for it: the question (and photo) go back in the
      // composer, ready for Try again. The composer was read-only meanwhile.
      update((current) => current.filter((turn) => turn.key !== key));
      setQuestion(text);
      setPhoto(sentPhoto);
      if (needsConsent) {
        setConsented(false);
        setConsentOpen(true);
      } else {
        setFailed({ message: error, retry });
      }
    }
    setSending(false);
    showComposer('smooth');
  };

  const rate = async (turn: Turn, rating: 'up' | 'down') => {
    if (!turn.id) return;
    const next = turn.rating === rating ? null : rating;
    const previous = turn.rating ?? null;
    update((current) => current.map((t) => (t.key === turn.key ? { ...t, rating: next, rateFailed: false } : t)));
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/portal/ask/${turn.id}/rating`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) throw new Error('rating failed');
    } catch {
      update((current) => current.map((t) => (t.key === turn.key ? { ...t, rating: previous, rateFailed: true } : t)));
    }
  };

  const startOver = () => {
    for (const turn of turns) if (turn.photoUrl) URL.revokeObjectURL(turn.photoUrl);
    update(() => []);
    setNotice('');
    setFailed(null);
  };

  return (
    <>
      {turns.length === 0 ? (
        <section className={s.panel} aria-labelledby="ask-examples-h">
          <div className={a.examples}>
            <h2 id="ask-examples-h" className={a.secTitle}>
              Try asking
            </h2>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className={a.example}
                onClick={() => {
                  setQuestion(example);
                  inputRef.current?.focus();
                }}
              >
                <MessageCircleQuestion size={18} aria-hidden="true" />
                <span>{example}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <ol className={a.thread} aria-live="polite" aria-label="Conversation">
          {turns.map((turn) => (
            <li key={turn.key} className={a.turn}>
              <div className={a.question}>
                {turn.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview
                  <img src={turn.photoUrl} alt="The photo you sent" className={a.questionPhoto} />
                ) : turn.hadPhoto ? (
                  <span className={a.photoNote}>
                    <Camera size={14} aria-hidden="true" /> Photo sent
                  </span>
                ) : null}
                {turn.question ? <p className={a.questionText}>{turn.question}</p> : null}
              </div>
              {turn.answer ? (
                <div className={a.answer} data-message-text="">
                  <Answer text={turn.answer} />
                  <div className={a.rate} role="group" aria-label="Was this helpful?">
                    <button
                      type="button"
                      className={a.thumb}
                      aria-pressed={turn.rating === 'up'}
                      aria-label="Helpful"
                      onClick={() => rate(turn, 'up')}
                    >
                      <ThumbsUp size={18} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={a.thumb}
                      aria-pressed={turn.rating === 'down'}
                      aria-label="Not helpful"
                      onClick={() => rate(turn, 'down')}
                    >
                      <ThumbsDown size={18} aria-hidden="true" />
                    </button>
                  </div>
                  {turn.rateFailed ? (
                    <p className={a.rateError} role="alert">
                      That didn&apos;t save. Tap it again.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className={`${a.answer} ${a.pending}`} role="status">
                  <ThinkingOrb state="breathing" size={20} theme="dark" aria-hidden="true" />
                  Thinking…
                </p>
              )}
            </li>
          ))}
        </ol>
      )}


      <BorderBeam size="line" active={sending && !reducedMotion} theme="dark" strength={0.7} className={a.composerBeam}>
        <form ref={composerRef} className={`${s.panel} ${a.composer}`} onSubmit={send}>
          {failed ? (
            <div className={a.failed} role="alert">
              <p>{failed.message}</p>
              {failed.retry ? (
                <button type="button" className={`${s.btnSecondary} ${a.retry}`} onClick={() => void send()}>
                  <RotateCw size={18} aria-hidden="true" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          <label htmlFor="ask-question" className={s.srOnly}>
            Your question
          </label>
          <textarea
            id="ask-question"
            ref={inputRef}
            className={`${p.input} ${p.textarea} ${a.input}`}
            placeholder="What's going on?"
            value={question}
            maxLength={MAX_QUESTION_CHARS}
            rows={3}
            enterKeyHint="send"
            readOnly={sending}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (!isComposerSend(event.nativeEvent)) return;
              event.preventDefault();
              void send();
            }}
          />
          {photo ? (
            <div className={a.attached}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL preview */}
              <img src={photo.url} alt="Photo to send" className={a.attachedPhoto} />
              <button
                type="button"
                className={s.iconBtn}
                aria-label="Remove photo"
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  setPhoto(null);
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {notice ? (
            <p className={`${p.hint} ${p.hintError}`} role="alert">
              {notice}
            </p>
          ) : null}
          <div className={a.actions}>
            <label className={`${s.btnSecondary} ${a.photoBtn}`} aria-disabled={preparing || sending || undefined}>
              <Camera size={20} aria-hidden="true" />
              {preparing ? 'Adding…' : photo ? 'Change photo' : 'Photo'}
              <input
                key={fileKey}
                type="file"
                accept="image/*"
                className={s.srOnly}
                disabled={preparing || sending}
                onChange={(event) => void pickPhoto(event.target.files?.[0])}
              />
            </label>
            {turns.length > 0 && !sending ? (
              <button type="button" className={`${s.btnSecondary} ${a.newBtn}`} onClick={startOver}>
                <SquarePen size={20} aria-hidden="true" />
                New chat
              </button>
            ) : null}
            <button
              type="submit"
              className={`${s.btnPrimary} ${a.sendBtn}`}
              disabled={sending || preparing || (!question.trim() && !photo)}
            >
              <SendHorizontal size={20} aria-hidden="true" />
              {sending ? 'Asking…' : 'Ask'}
            </button>
          </div>
        </form>
      </BorderBeam>
      {consentOpen ? (
        <AiConsentSheet
          provider="deepseek"
          onClose={() => setConsentOpen(false)}
          onAgreed={() => {
            setConsentOpen(false);
            setConsented(true);
            // The question that was waiting goes now.
            void send(undefined, true);
          }}
        />
      ) : null}
      {keyboardInset > 0 ? <div aria-hidden="true" style={{ height: keyboardInset }} /> : null}
      <div ref={bottomRef} className={a.anchor} aria-hidden="true" />
    </>
  );
}
