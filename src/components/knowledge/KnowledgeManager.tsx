'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Camera, ChevronDown, ThumbsDown, ThumbsUp } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { AskLogView } from '@/lib/ask/chat';
import type { PracticeLogView } from '@/lib/ask/practice';
import {
  MAX_NOTE_FILE_BYTES,
  NOTE_FILE_ACCEPT,
  estimateTokens,
  parseNoteFile,
  type KnowledgeNote,
  type NoteDraft,
} from '@/lib/ask/notes';
import { Seg } from '@/components/portal/admin-ops/AdminKit';
import { PracticeFeedback } from '@/components/portal/rep/PracticeFeedback';
import {
  AdminEmpty,
  AdminFailed,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
} from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import k from './knowledge.module.css';

// The owner's Knowledge tab (People hub): the notes Ask 3C answers from, what
// reps asked it, and their Practice sessions. Notes are restricted carrier
// material, entered here and stored only in Firestore through /api/portal/knowledge.

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };
type Editor = { id: string | null } & NoteDraft;
type View = 'notes' | 'questions' | 'practice';

const WHEN = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : '');
const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || 'The request failed');
  return json as T;
}

export function KnowledgeManager() {
  const [view, setView] = useState<View>('notes');
  const [notes, setNotes] = useState<Load<KnowledgeNote[]>>({ status: 'loading' });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | 'upload' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [fileKey, setFileKey] = useState(0);

  const loadNotes = useCallback(async () => {
    try {
      const { notes: list } = await api<{ notes: KnowledgeNote[] }>('/api/portal/knowledge');
      setNotes({ status: 'ready', data: list });
    } catch {
      setNotes({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const openEditor = (next: Editor) => {
    setEditor(next);
    setConfirmingDelete(false);
    setError('');
    setDone('');
    setView('notes');
    window.scrollTo({ top: 0 });
  };

  const save = async () => {
    if (!editor) return;
    setBusy('save');
    setError('');
    try {
      const draft = { title: editor.title, body: editor.body };
      if (editor.id) await api(`/api/portal/knowledge/${editor.id}`, { method: 'PATCH', body: draft });
      else await api('/api/portal/knowledge', { method: 'POST', body: { notes: [draft] } });
      setDone(editor.id ? 'Note saved.' : 'Note added.');
      setEditor(null);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The note was not saved');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!editor?.id) return;
    setBusy('delete');
    setError('');
    try {
      await api(`/api/portal/knowledge/${editor.id}`, { method: 'DELETE' });
      setDone('Note deleted.');
      setEditor(null);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The note was not deleted');
    } finally {
      setBusy(null);
      setConfirmingDelete(false);
    }
  };

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setFileKey((key) => key + 1);
    if (files.length === 0) return;
    setError('');
    setDone('');
    const wrongType = files.find((file) => !/\.(md|markdown|txt)$/i.test(file.name));
    if (wrongType) return setError(`${wrongType.name} is not a .md or .txt file.`);
    const tooBig = files.find((file) => file.size > MAX_NOTE_FILE_BYTES);
    if (tooBig) return setError(`${tooBig.name} is over ${MAX_NOTE_FILE_BYTES / 1024} KB. Split it into smaller files.`);

    setBusy('upload');
    try {
      const drafts = await Promise.all(files.map(async (file) => parseNoteFile(file.name, await file.text())));
      const empty = drafts.find((draft) => !draft.body);
      if (empty) throw new Error(`"${empty.title}" has no text under its title.`);
      await api('/api/portal/knowledge', { method: 'POST', body: { notes: drafts } });
      setDone(`Added ${plural(drafts.length, 'note')}.`);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The upload failed');
    } finally {
      setBusy(null);
    }
  };

  const list = notes.status === 'ready' ? notes.data : [];
  const chars = list.reduce((sum, note) => sum + note.title.length + note.body.length, 0);

  return (
    <div className={u.page}>
      <AdminPageHead
        title="Knowledge"
        meta={
          notes.status === 'ready' ? (
            <>
              <b>{plural(list.length, 'note')}</b> · {chars.toLocaleString('en-US')} characters · about{' '}
              {estimateTokens(chars).toLocaleString('en-US')} tokens
            </>
          ) : null
        }
        sub="Ask 3C answers reps only from these notes. Keep them short and exact. What reps asked is under Questions, their practice pitches under Practice."
        actions={
          view === 'notes' ? (
            <>
              <label className={`${s.btnSecondary} ${u.sm} ${busy ? u.disabled : ''}`}>
                {busy === 'upload' ? 'Uploading…' : 'Upload .md / .txt'}
                <input
                  key={fileKey}
                  type="file"
                  accept={NOTE_FILE_ACCEPT}
                  multiple
                  className={s.srOnly}
                  disabled={busy !== null}
                  onChange={onFiles}
                />
              </label>
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                disabled={busy !== null}
                onClick={() => openEditor({ id: null, title: '', body: '' })}
              >
                Add note
              </button>
            </>
          ) : null
        }
      />

      <Seg<View>
        label="Knowledge sections"
        value={view}
        options={[
          { value: 'notes', label: 'Notes' },
          { value: 'questions', label: 'Questions' },
          { value: 'practice', label: 'Practice' },
        ]}
        onChange={setView}
      />

      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>
          {error}
        </AdminNotice>
      ) : null}
      {done ? (
        <AdminNotice tone="ok" onDismiss={() => setDone('')}>
          {done}
        </AdminNotice>
      ) : null}

      {view === 'practice' ? (
        <PracticeSessions />
      ) : view === 'questions' ? (
        <Questions
          onAddToKnowledge={(row) =>
            openEditor({
              id: null,
              title: (row.question || 'Question with a photo').slice(0, 120),
              body: `${row.prevQuestion ? `Follow-up to: ${row.prevQuestion}\n` : ''}Question: ${row.question || '(photo only)'}\n\nAsk 3C answered:\n${row.answer}\n\nThe right answer:\n`,
            })
          }
        />
      ) : (
        <>
          {editor ? (
            <section className={s.panel} aria-labelledby="note-editor-h">
              <div className={`${s.panelHead} ${u.band}`}>
                <h2 id="note-editor-h" className={s.kicker}>
                  {editor.id ? 'Edit note' : 'New note'}
                </h2>
                <span className={u.panelMeta}>{editor.body.length.toLocaleString('en-US')} characters</span>
              </div>
              <div className={`${u.panelBody} ${u.formGrid}`}>
                <div className={u.field}>
                  <label className={u.label} htmlFor="note-title">
                    Title
                  </label>
                  <input
                    id="note-title"
                    className={u.input}
                    value={editor.title}
                    maxLength={200}
                    onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                  />
                </div>
                <div className={u.field}>
                  <label className={u.label} htmlFor="note-body">
                    Note
                  </label>
                  <textarea
                    id="note-body"
                    className={`${u.input} ${u.textarea} ${k.body}`}
                    value={editor.body}
                    onChange={(event) => setEditor({ ...editor, body: event.target.value })}
                  />
                  <p className={u.hint}>Plain text or markdown. Steps as numbered lines answer best.</p>
                </div>

                {confirmingDelete ? (
                  <div className={u.confirm} role="alertdialog" aria-labelledby="note-delete-q">
                    <p id="note-delete-q" className={k.confirmText}>
                      Delete &ldquo;{editor.title || 'this note'}&rdquo;? Ask 3C stops using it right away.
                    </p>
                    <div className={u.btnRow}>
                      <button
                        type="button"
                        className={`${s.btnSecondary} ${u.sm}`}
                        onClick={() => setConfirmingDelete(false)}
                        disabled={busy === 'delete'}
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                        onClick={remove}
                        disabled={busy !== null}
                      >
                        {busy === 'delete' ? 'Deleting…' : 'Delete note'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={u.btnRow}>
                    <button
                      type="button"
                      className={`${s.btnPrimary} ${u.primarySm}`}
                      onClick={save}
                      disabled={busy !== null}
                    >
                      {busy === 'save' ? 'Saving…' : 'Save note'}
                    </button>
                    <button
                      type="button"
                      className={`${s.btnSecondary} ${u.sm}`}
                      onClick={() => setEditor(null)}
                      disabled={busy !== null}
                    >
                      Cancel
                    </button>
                    {editor.id ? (
                      <button
                        type="button"
                        className={`${s.btnSecondary} ${u.sm} ${u.quiet} ${k.push}`}
                        onClick={() => setConfirmingDelete(true)}
                        disabled={busy !== null}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <section className={s.panel} aria-labelledby="notes-h">
            <div className={`${s.panelHead} ${u.band}`}>
              <h2 id="notes-h" className={s.kicker}>
                Notes
              </h2>
              <span className={u.panelMeta}>In the order Ask 3C reads them</span>
            </div>
            {notes.status === 'loading' ? (
              <AdminSkeletonRows rows={3} label="Loading notes" />
            ) : notes.status === 'error' ? (
              <div className={u.panelBody}>
                <AdminFailed what="the notes" onRetry={() => void loadNotes()} />
              </div>
            ) : list.length === 0 ? (
              <div className={u.panelBody}>
                <AdminEmpty title="No notes yet">
                  Add a note or upload .md / .txt files. Until there are notes, Ask 3C tells reps to call Jeremy or
                  their manager.
                </AdminEmpty>
              </div>
            ) : (
              <ul className={`${u.rows} ${k.noteCols}`}>
                {list.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      className={u.row}
                      onClick={() => openEditor({ id: note.id, title: note.title, body: note.body })}
                    >
                      <span className={u.cellMain}>
                        <span className={k.noteTitle}>{note.title}</span>
                        <span className={u.cellSub}>
                          {note.body.length.toLocaleString('en-US')} characters
                          {note.updatedAt ? ` · ${when(note.updatedAt)}` : ''}
                          {note.updatedBy ? ` · ${note.updatedBy}` : ''}
                        </span>
                      </span>
                      <span className={`${u.cellEnd} ${k.edit}`}>Edit</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Questions({ onAddToKnowledge }: { onAddToKnowledge: (row: AskLogView) => void }) {
  const [filter, setFilter] = useState<'all' | 'down'>('all');
  const [rows, setRows] = useState<Load<AskLogView[]>>({ status: 'loading' });

  const load = useCallback(async (which: 'all' | 'down') => {
    setRows({ status: 'loading' });
    try {
      const { questions } = await api<{ questions: AskLogView[] }>(
        `/api/portal/knowledge/questions${which === 'down' ? '?rating=down' : ''}`
      );
      setRows({ status: 'ready', data: questions });
    } catch {
      setRows({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the filter changes
    void load(filter);
  }, [filter, load]);

  return (
    <section className={s.panel} aria-labelledby="questions-h">
      <div className={`${s.panelHead} ${u.band}`}>
        <h2 id="questions-h" className={s.kicker}>
          {filter === 'down' ? 'Thumbs down' : 'Latest 100'}
        </h2>
        <div className={u.chips} role="group" aria-label="Show">
          <button type="button" className={u.chip} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </button>
          <button type="button" className={u.chip} aria-pressed={filter === 'down'} onClick={() => setFilter('down')}>
            Thumbs down
          </button>
        </div>
      </div>
      {rows.status === 'loading' ? (
        <AdminSkeletonRows rows={3} label="Loading questions" />
      ) : rows.status === 'error' ? (
        <div className={u.panelBody}>
          <AdminFailed what="the questions" onRetry={() => void load(filter)} />
        </div>
      ) : rows.data.length === 0 ? (
        <div className={u.panelBody}>
          <AdminEmpty title={filter === 'down' ? 'No thumbs down' : 'No questions yet'}>
            {filter === 'down'
              ? 'Answers reps mark with a thumbs down show here.'
              : 'Questions reps ask Ask 3C show here, newest first.'}
          </AdminEmpty>
        </div>
      ) : (
        <ul className={k.questions}>
          {rows.data.map((row) => (
            <li key={row.id} className={`${k.question} ${row.rating === 'down' ? u.rowWarn : ''}`}>
              <p className={k.qMeta}>
                <b>{row.repName || 'Unknown rep'}</b>
                <span>{when(row.createdAt)}</span>
                {row.hadPhoto ? (
                  <span className={u.tag}>
                    <Camera size={12} aria-hidden="true" /> Photo
                  </span>
                ) : null}
                {row.rating === 'up' ? (
                  <span className={`${k.rating} ${u.toneLime}`}>
                    <ThumbsUp size={14} aria-hidden="true" /> Helpful
                  </span>
                ) : row.rating === 'down' ? (
                  <span className={`${k.rating} ${u.toneAmber}`}>
                    <ThumbsDown size={14} aria-hidden="true" /> Not helpful
                  </span>
                ) : null}
              </p>
              {row.prevQuestion ? (
                <p className={k.prevText}>
                  <span>Follow-up to</span> {row.prevQuestion}
                </p>
              ) : null}
              <p className={k.qText}>{row.question || '(photo only)'}</p>
              <p className={k.aText}>{row.answer}</p>
              <div className={u.btnRow}>
                <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => onAddToKnowledge(row)}>
                  Add to knowledge
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PracticeSessions() {
  const [rows, setRows] = useState<Load<PracticeLogView[]>>({ status: 'loading' });
  const [rep, setRep] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows({ status: 'loading' });
    try {
      const { sessions } = await api<{ sessions: PracticeLogView[] }>('/api/portal/knowledge/practice');
      setRows({ status: 'ready', data: sessions });
    } catch {
      setRows({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once on open
    void load();
  }, [load]);

  const all = rows.status === 'ready' ? rows.data : [];
  const reps = [...new Set(all.map((row) => row.repName || 'Unknown rep'))].sort((x, y) => x.localeCompare(y));
  const shown = rep ? all.filter((row) => (row.repName || 'Unknown rep') === rep) : all;

  return (
    <section className={s.panel} aria-labelledby="practice-h">
      <div className={`${s.panelHead} ${u.band}`}>
        <h2 id="practice-h" className={s.kicker}>
          Latest 100
        </h2>
        {reps.length > 1 ? (
          <label className={`${u.selectWrap} ${k.repFilter}`}>
            <span className={s.srOnly}>Rep</span>
            <select className={u.input} value={rep} onChange={(event) => setRep(event.target.value)}>
              <option value="">All reps</option>
              {reps.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>
        ) : (
          <span className={u.panelMeta}>Finished practice pitches, newest first</span>
        )}
      </div>
      {rows.status === 'loading' ? (
        <AdminSkeletonRows rows={3} label="Loading practice sessions" />
      ) : rows.status === 'error' ? (
        <div className={u.panelBody}>
          <AdminFailed what="the practice sessions" onRetry={() => void load()} />
        </div>
      ) : shown.length === 0 ? (
        <div className={u.panelBody}>
          <AdminEmpty title="No practice yet">
            When a rep finishes a practice pitch in Ask 3C, it shows here with the coach&apos;s feedback.
          </AdminEmpty>
        </div>
      ) : (
        <ul className={k.questions}>
          {shown.map((row) => {
            const expanded = open === row.id;
            return (
              <li key={row.id} className={k.session}>
                {/* One line per session; tap it for the homeowner, the feedback and the transcript. */}
                <button
                  type="button"
                  className={k.sessionRow}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : row.id)}
                >
                  <b>{row.repName || 'Unknown rep'}</b>
                  <span>{row.persona || 'Homeowner'}</span>
                  {row.score !== null ? <span className={u.toneLime}>{row.score}/10</span> : null}
                  {row.result ? <span>{row.result}</span> : null}
                  <span>{when(row.createdAt)}</span>
                  <ChevronDown size={16} aria-hidden="true" className={k.chev} />
                </button>
                {expanded ? (
                  <div className={k.sessionBody}>
                    {row.homeowner ? <p className={k.qMeta}>Homeowner: {row.homeowner}</p> : null}
                    {row.door ? <p className={k.qMeta}>At the door: {row.door}</p> : null}
                    <div className={k.aText}>
                      <PracticeFeedback text={row.feedback} />
                    </div>
                    <details className={k.transcript}>
                      <summary>Transcript ({plural(row.turns.length, 'line')})</summary>
                      <ol>
                        {row.turns.map((turn, index) => (
                          <li key={index}>
                            <b>{turn.role === 'rep' ? 'Rep' : turn.role === 'screen' ? 'Screen' : 'Homeowner'}:</b> {turn.text}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
