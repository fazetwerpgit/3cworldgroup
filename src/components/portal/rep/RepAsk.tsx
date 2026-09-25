'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, MessageCircleQuestion, SendHorizontal, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { askEnabled } from '@/lib/ask/flag';
import {
  ASK_HISTORY_TURNS,
  MAX_QUESTION_CHARS,
  answerLines,
  type AskReply,
  type AskTurnMessage,
} from '@/lib/ask/chat';
import { FormUploadError, prepareFormFile } from '@/lib/forms/uploadFormAttachment';
import s from './rep.module.css';
import p from './rep-page.module.css';
import a from './rep-ask.module.css';

// Ask 3C: a rep at a customer's door asks what to do; the answer comes from
// the owner's knowledge notes only (POST /api/portal/ask). One conversation per
// browser session: the last turns live in sessionStorage and go back with each
// question so a follow-up has context. Photos are never kept.

interface Turn {
  key: string;
  question: string;
  hadPhoto: boolean;
  /** This session's preview of the attached photo (not persisted). */
  photoUrl?: string;
  /** The askLog id, for the thumbs. */
  id?: string;
  answer?: string;
  error?: string;
  rating?: 'up' | 'down' | null;
}

const STORE_KEY = 'ask3c-conversation';
const REQUEST_TIMEOUT_MS = 45_000;
// HEIC is taken and turned into a JPEG on the phone (Safari decodes it); the
// model reads JPEG, PNG and WebP.
const PHOTO_PICK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PHOTO_SEND_TYPES: Record<string, true> = { 'image/jpeg': true, 'image/png': true, 'image/webp': true };

const EXAMPLES = [
  "The order screen won't take the customer's address. What do I do?",
  'The credit check came back with an error. What are my options?',
  "The install dates won't load. How do I finish the order?",
];

function readStored(): Turn[] {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as Turn[]).filter((turn) => turn && typeof turn.question === 'string') : [];
  } catch {
    return [];
  }
}

function store(turns: Turn[]) {
  try {
    const kept = turns
      .filter((turn) => turn.answer)
      .slice(-ASK_HISTORY_TURNS)
      .map((turn) => ({ ...turn, photoUrl: undefined }));
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(kept));
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
              <a key={index} href={`tel:${part.tel}`} className={a.tel}>
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

export function RepAsk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restored after mount: the server render has no sessionStorage.
    setTurns(readStored());
  }, []);

  const enabled = askEnabled();
  if (!enabled) {
    return (
      <div className={p.page}>
        <header className={p.head}>
          <h1 className={p.title}>Ask 3C</h1>
        </header>
        <section className={s.panel}>
          <div className={p.empty}>
            <div>
              <strong>Ask 3C is not turned on yet.</strong>
              <p>Until it is, call Jeremy or your manager when an order gets stuck.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const update = (next: (current: Turn[]) => Turn[]) => {
    setTurns((current) => {
      const updated = next(current);
      store(updated);
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

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = question.trim();
    if (sending || preparing || (!text && !photo)) return;
    if (text.length > MAX_QUESTION_CHARS) {
      setNotice(`Keep the question under ${MAX_QUESTION_CHARS} characters.`);
      return;
    }
    const key = `${Date.now()}`;
    const history = historyOf(turns);
    const sentPhoto = photo;
    update((current) => [...current, { key, question: text, hadPhoto: !!sentPhoto, photoUrl: sentPhoto?.url }]);
    setQuestion('');
    setPhoto(null);
    setNotice('');
    setSending(true);
    window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));

    let patch: Partial<Turn>;
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
      patch =
        res.ok && json.answer && json.id
          ? { id: json.id, answer: json.answer, rating: null }
          : { error: json.error || "Ask 3C couldn't answer right now. Try again, or call Jeremy or your manager." };
    } catch {
      patch = { error: 'No answer came back. Check your signal and try again, or call Jeremy or your manager.' };
    }
    update((current) => current.map((turn) => (turn.key === key ? { ...turn, ...patch } : turn)));
    setSending(false);
    window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  const rate = async (turn: Turn, rating: 'up' | 'down') => {
    if (!turn.id) return;
    const next = turn.rating === rating ? null : rating;
    const previous = turn.rating ?? null;
    update((current) => current.map((t) => (t.key === turn.key ? { ...t, rating: next } : t)));
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/portal/ask/${turn.id}/rating`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) throw new Error('rating failed');
    } catch {
      update((current) => current.map((t) => (t.key === turn.key ? { ...t, rating: previous } : t)));
    }
  };

  const startOver = () => {
    for (const turn of turns) if (turn.photoUrl) URL.revokeObjectURL(turn.photoUrl);
    update(() => []);
    setNotice('');
  };

  const answered = turns.some((turn) => turn.answer || turn.error);

  return (
    <div className={`${p.page} ${a.page}`}>
      <header className={p.head}>
        <h1 className={p.title}>Ask 3C</h1>
        {turns.length > 0 && !sending ? (
          <button type="button" className={s.textBtn} onClick={startOver}>
            Start over
          </button>
        ) : null}
        <p className={p.lede}>Stuck on an order? Ask here. Prices and promos are always on the order screen.</p>
      </header>

      {turns.length === 0 ? (
        <section className={s.panel} aria-labelledby="ask-examples-h">
          <div className={a.examples}>
            <h2 id="ask-examples-h" className={s.kicker}>
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
                <div className={a.answer}>
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
                </div>
              ) : turn.error ? (
                <p className={`${a.answer} ${a.failed}`} role="alert">
                  {turn.error}
                </p>
              ) : (
                <p className={`${a.answer} ${a.pending}`} role="status">
                  Looking in the notes…
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {answered ? <p className={a.stuck}>Still stuck? Call Jeremy or your manager.</p> : null}

      <form className={`${s.panel} ${a.composer}`} onSubmit={send}>
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
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send();
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
      <div ref={endRef} />
    </div>
  );
}
