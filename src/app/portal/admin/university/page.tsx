'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { FileText, Link2, ListChecks, Plus, Search, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { randomHex } from '@/lib/randomHex';
import { useTrainingUpload } from '@/hooks/useTrainingUpload';
import { TRAINING_CATEGORIES, TrainingResource } from '@/types';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  StatusDot,
} from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import un from './admin-university.module.css';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TRAINING_CATEGORIES.map((category) => [category.value, category.label])
);

const CATEGORY_OPTIONS = [{ value: 'all', label: 'All' }, ...TRAINING_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))];

const TYPE_ICON = { video: Video, document: FileText, link: Link2, quiz: ListChecks } as const;
const TYPE_LABEL = { video: 'Video', document: 'Document', link: 'Link', quiz: 'Quiz' } as const;

// The training write routes, and the all=true listing that returns unpublished
// content, verify management from the ID token. The [id] in each URL is the
// TARGET resource.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

type PendingUpload = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

function AdminUniversity() {
  const { user } = useAuth();
  const { upload, progress, uploading, error: uploadError } = useTrainingUpload();

  const [items, setItems] = useState<TrainingResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [addCategory, setAddCategory] = useState('att');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [publish, setPublish] = useState(true);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch('/api/portal/training?all=true', {
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (res.ok) setItems(data.resources || []);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setErr('');
    setMsg('');
    const uploadId = randomHex();
    const result = await upload(file, uploadId);
    if (result) setPending(result);
  };

  const canSave = Boolean(title.trim() && addCategory && pending && !uploading && !saving);

  const onSave = async () => {
    if (!user || !pending) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const res = await fetch('/api/portal/training', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          title: title.trim(),
          category: addCategory,
          description: description.trim(),
          isRequired: required,
          isPublished: publish,
          storagePath: pending.storagePath,
          fileName: pending.fileName,
          mimeType: pending.mimeType,
          fileSize: pending.fileSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setMsg('Content added.');
      setTitle('');
      setDescription('');
      setRequired(false);
      setPublish(true);
      setPending(null);
      setShowAdd(false);
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Returns true when the change saved; otherwise shows why and leaves the view as is.
  const mutate = async (url: string, init: RequestInit, failMsg: string): Promise<boolean> => {
    setErr('');
    setMsg('');
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : failMsg);
      }
      return true;
    } catch (error) {
      setErr(error instanceof Error && error.message ? error.message : failMsg);
      return false;
    }
  };

  const togglePublish = async (item: TrainingResource) => {
    if (!user) return;
    const ok = await mutate(
      `/api/portal/training/${item.id}`,
      {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ isPublished: !item.isPublished }),
      },
      item.isPublished ? "Couldn't unpublish. Try again." : "Couldn't publish. Try again."
    );
    if (ok) await load();
  };

  const remove = async (item: TrainingResource) => {
    if (!user) return;
    const ok = await mutate(
      `/api/portal/training/${item.id}`,
      { method: 'DELETE', headers: await authHeaders() },
      "Couldn't delete. Try again."
    );
    setConfirmDeleteId(null);
    if (ok) await load();
  };

  const startEdit = (item: TrainingResource) => {
    setEditingId(item.id!);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
  };

  const saveEdit = async (item: TrainingResource) => {
    if (!user || !editTitle.trim()) return;
    const ok = await mutate(
      `/api/portal/training/${item.id}`,
      {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
      },
      "Couldn't save changes. Try again."
    );
    if (!ok) return;
    setEditingId(null);
    await load();
  };

  const fmtSize = (bytes?: number) => (bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q || item.title.toLowerCase().includes(q);
      const matchesCategory = category === 'all' || item.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [items, query, category]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    items.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [items]);

  const publishedCount = items.filter((item) => item.isPublished).length;
  const addError = err || uploadError;

  return (
    <div className={u.page}>
      <AdminPageHead
        title="University Content"
        meta={
          loading || loadFailed ? null : (
            <>
              <b>{items.length}</b> items · {publishedCount} published
            </>
          )
        }
        actions={
          showAdd ? (
            <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setShowAdd(false)} disabled={saving}>
              Cancel
            </button>
          ) : (
            <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={() => setShowAdd(true)}>
              <Plus size={18} aria-hidden="true" />
              Add Content
            </button>
          )
        }
      />

      {addError ? (
        <AdminNotice tone="error" onDismiss={err ? () => setErr('') : undefined}>
          {addError}
        </AdminNotice>
      ) : null}
      {msg ? (
        <AdminNotice tone="ok" onDismiss={() => setMsg('')}>
          {msg}
        </AdminNotice>
      ) : null}

      {showAdd ? (
        <section className={s.panel} aria-labelledby="uni-add-heading">
          <div className={`${s.panelHead} ${u.band}`}>
            <h2 id="uni-add-heading" className={s.kicker}>
              Add content
            </h2>
          </div>
          <div className={`${u.panelBody} ${u.formGrid} ${u.formGrid2}`}>
            <div className={u.field}>
              <label className={u.label} htmlFor="uni-title">
                Title
              </label>
              <input
                id="uni-title"
                className={u.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AT&T Fiber install walkthrough"
              />
            </div>
            <div className={u.field}>
              <label className={u.label} htmlFor="uni-desc">
                Description
              </label>
              <input
                id="uni-desc"
                className={u.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short summary"
              />
            </div>
            <div className={`${u.field} ${u.wide}`}>
              <span className={u.label} id="uni-carrier-label">
                Carrier
              </span>
              <div className={un.chipWrap} role="group" aria-labelledby="uni-carrier-label">
                {TRAINING_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={u.chip}
                    aria-pressed={addCategory === c.value}
                    onClick={() => setAddCategory(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${u.field} ${u.wide}`}>
              <label className={u.label} htmlFor="uni-file">
                File (PDF, image, or video)
              </label>
              <input
                id="uni-file"
                className={`${u.input} ${u.fileInput}`}
                type="file"
                accept="application/pdf,image/*,video/*"
                onChange={onPickFile}
              />
              {uploading ? (
                <p className={u.hint} role="status">
                  Uploading… {progress}%
                </p>
              ) : null}
              {pending && !uploading ? (
                <p className={`${u.hint} ${u.hintOk}`}>
                  Ready: {pending.fileName} ({fmtSize(pending.fileSize)})
                </p>
              ) : null}
            </div>
            <div className={`${u.wide} ${un.checks}`}>
              <label className={u.check}>
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
                Required training
              </label>
              <label className={u.check}>
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                Publish immediately
              </label>
            </div>
            <div className={`${u.wide} ${u.btnRow}`}>
              <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={onSave} disabled={!canSave}>
                {saving ? 'Saving…' : 'Save Content'}
              </button>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                onClick={() => setShowAdd(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className={u.toolbar}>
        <label className={u.search}>
          <Search size={18} aria-hidden="true" />
          <input
            className={u.input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search content"
            aria-label="Search university content"
          />
        </label>
        <div className={u.chips} role="group" aria-label="Filter by category">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={u.chip}
              aria-pressed={category === opt.value}
              onClick={() => setCategory(opt.value)}
            >
              {opt.label}
              {!loading && !loadFailed ? <span className={u.chipCount}>{categoryCounts[opt.value] || 0}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={un.grid} role="status" aria-label="Loading content">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`${s.panel} ${un.card}`} aria-hidden="true">
              <div className={un.cardBody}>
                <span className={s.skel} style={{ width: 90, height: 12 }} />
                <span className={s.skel} style={{ width: `${70 - index * 10}%`, height: 20 }} />
                <span className={s.skel} style={{ width: '50%', height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : loadFailed ? (
        <section className={s.panel}>
          <AdminFailed what="university content" onRetry={load} />
        </section>
      ) : filtered.length === 0 ? (
        <section className={s.panel}>
          {items.length ? (
            <AdminEmpty title="No content matches">Try a broader search or clear the category filter.</AdminEmpty>
          ) : (
            <AdminEmpty
             
              title="No content yet"
              action={
                showAdd ? undefined : (
                  <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setShowAdd(true)}>
                    <Plus size={16} aria-hidden="true" />
                    Add Content
                  </button>
                )
              }
            >
              Add training content to get started.
            </AdminEmpty>
          )}
        </section>
      ) : (
        <ul className={un.grid}>
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.type] ?? FileText;
            const editing = editingId === item.id;
            const preview = item.fileName
              ? `${item.fileName}${item.fileSize ? ` · ${fmtSize(item.fileSize)}` : ''}`
              : item.description;
            return (
              <li key={item.id} className={`${s.panel} ${un.card}`}>
                <div className={un.cardBody}>
                  <div className={un.cardTop}>
                    <span className={s.kicker}>{CATEGORY_LABEL[item.category] || item.category}</span>
                    <span className={un.cardTags}>
                      {item.isRequired ? <span className={`${u.tag} ${u.tagAmber}`}>Required</span> : null}
                      <StatusDot tone={item.isPublished ? 'lime' : 'muted'}>
                        {item.isPublished ? 'Published' : 'Draft'}
                      </StatusDot>
                    </span>
                  </div>

                  {editing ? (
                    <div className={u.formGrid}>
                      <div className={u.field}>
                        <label className={u.label} htmlFor={`uni-edit-title-${item.id}`}>
                          Title
                        </label>
                        <input
                          id={`uni-edit-title-${item.id}`}
                          className={u.input}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </div>
                      <div className={u.field}>
                        <label className={u.label} htmlFor={`uni-edit-desc-${item.id}`}>
                          Description
                        </label>
                        <input
                          id={`uni-edit-desc-${item.id}`}
                          className={u.input}
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className={un.cardTitle}>{item.title}</h3>
                      {preview ? (
                        <p className={un.cardFile}>
                          <Icon size={16} aria-hidden="true" />
                          <span>{preview}</span>
                        </p>
                      ) : null}
                      {item.fileName && item.description ? <p className={un.cardDesc}>{item.description}</p> : null}
                    </>
                  )}
                </div>

                <div className={un.cardActions}>
                  {editing ? (
                    <>
                      <button type="button" className={`${s.btnPrimary} ${u.primarySm}`} onClick={() => saveEdit(item)}>
                        Save
                      </button>
                      <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={un.publish}>
                        <button
                          type="button"
                          className={u.switch}
                          aria-pressed={item.isPublished}
                          aria-label={item.isPublished ? `Unpublish ${item.title}` : `Publish ${item.title}`}
                          onClick={() => togglePublish(item)}
                        />
                        <span className={un.publishText}>
                          {TYPE_LABEL[item.type] ?? item.type} · {item.isPublished ? 'Published' : 'Unpublished'}
                        </span>
                      </span>
                      <span className={u.btnRow}>
                        <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => startEdit(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                          onClick={() => setConfirmDeleteId(item.id!)}
                        >
                          Delete
                        </button>
                      </span>
                    </>
                  )}
                </div>

                {confirmDeleteId === item.id ? (
                  <div className={u.confirm} role="alert">
                    <span>Delete &ldquo;{item.title}&rdquo;? This also removes the uploaded file.</span>
                    <span className={u.btnRow}>
                      <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                        onClick={() => remove(item)}
                      >
                        Yes, delete
                      </button>
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AdminUniversityPage() {
  return (
    <AdminGate roles={['admin', 'operations']}>
      <AdminUniversity />
    </AdminGate>
  );
}
