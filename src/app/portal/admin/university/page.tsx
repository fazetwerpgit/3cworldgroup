'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-admin-a.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { useTrainingUpload } from '@/hooks/useTrainingUpload';
import { TRAINING_CATEGORIES, TrainingResource } from '@/types';
import {
  AdminCatalogCard,
  AdminConfirmStrip,
} from '@/components/admin/AdminCatalogList';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TRAINING_CATEGORIES.map((category) => [category.value, category.label])
);

const CATEGORY_OPTIONS = [{ value: 'all', label: 'All' }, ...TRAINING_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))];

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
    setErr('');
    try {
      const res = await fetch('/api/portal/training?all=true', {
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (res.ok) setItems(data.resources || []);
      else setErr(data.error || 'Failed to load content');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to load content');
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
    const uploadId = crypto.randomUUID().replace(/-/g, '');
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

  const togglePublish = async (item: TrainingResource) => {
    if (!user) return;
    await fetch(`/api/portal/training/${item.id}`, {
      method: 'PUT',
      headers: await authHeaders(true),
      body: JSON.stringify({ isPublished: !item.isPublished }),
    });
    await load();
  };

  const remove = async (item: TrainingResource) => {
    if (!user) return;
    await fetch(`/api/portal/training/${item.id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    setConfirmDeleteId(null);
    await load();
  };

  const startEdit = (item: TrainingResource) => {
    setEditingId(item.id!);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
  };

  const saveEdit = async (item: TrainingResource) => {
    if (!user || !editTitle.trim()) return;
    await fetch(`/api/portal/training/${item.id}`, {
      method: 'PUT',
      headers: await authHeaders(true),
      body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
    });
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

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="admin-line-main sweep-admin-page">
        <div className="admin-line">
          <PageTitle title="University Content" meta={`${items.length} items`} subtitle="Keep training documents and videos ready for reps." actions={<button type="button" className="admin-line-primary" onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Cancel' : 'Add Content'}</button>} />
          <div className="admin-line-catalog-toolbar">
            <input className="admin-line-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search content" aria-label="Search university content" />
            <div className="admin-line-pill-row" role="group" aria-label="Filter by category">{CATEGORY_OPTIONS.map((opt) => <button key={opt.value} type="button" aria-pressed={category === opt.value} onClick={() => setCategory(opt.value)}>{opt.label}</button>)}</div>
          </div>
          {(err || uploadError) && <div className="admin-line-empty-state" style={{ borderColor: 'var(--admin-line-red)', color: 'var(--admin-line-red)' }}>{err || uploadError}</div>}
          {msg && <div className="admin-line-empty-state" style={{ borderColor: 'var(--admin-line-lime)', color: 'var(--admin-line-lime)' }}>{msg}</div>}
        {showAdd && (
          <div className="admin-line-editor">
            <div className="admin-line-panel-head">
              <div>
                <h2>Add Content</h2>
              </div>
            </div>
            <div className="admin-line-editor-grid" style={{ marginTop: 13 }}>
              <div className="admin-line-field">
                <label htmlFor="uni-title">Title</label>
                <input id="uni-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AT&amp;T Fiber install walkthrough" />
              </div>
              <div className="admin-line-field">
                <label>Carrier</label>
                <div className="admin-line-segmented" role="group" aria-label="Carrier">
                  {TRAINING_CATEGORIES.map((c) => (
                    <button key={c.value} type="button" aria-pressed={addCategory === c.value} onClick={() => setAddCategory(c.value)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="admin-line-field full">
                <label htmlFor="uni-desc">Description</label>
                <input id="uni-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional short summary" />
              </div>
              <div className="admin-line-field full">
                <label htmlFor="uni-file">File (PDF, image, or video)</label>
                <input id="uni-file" type="file" accept="application/pdf,image/*,video/*" onChange={onPickFile} />
                {uploading && <p className="admin-line-meta" style={{ marginTop: 6 }}>Uploading… {progress}%</p>}
                {pending && !uploading && (
                  <p className="admin-line-meta" style={{ marginTop: 6, color: 'var(--admin-line-lime)' }}>
                    Ready: {pending.fileName} ({fmtSize(pending.fileSize)})
                  </p>
                )}
              </div>
              <div className="admin-line-field full" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none' }}>
                  <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required training
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none' }}>
                  <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish immediately
                </label>
              </div>
            </div>
            <div className="admin-line-editor-actions">
              <button type="button" className="admin-line-primary" onClick={onSave} disabled={!canSave}>
                {saving ? 'Saving…' : 'Save Content'}
              </button>
              <button type="button" className="admin-line-clear-button" onClick={() => setShowAdd(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? <div className="admin-line-empty-state sweep-admin-empty" style={{ display: 'block' }}><strong>Loading Content</strong><p>Checking the training library.</p></div> : filtered.length === 0 ? <div className="admin-line-empty-state sweep-admin-empty" style={{ display: 'block' }}><strong>{items.length ? 'No Content Matches' : 'No Content Yet'}</strong><p>{items.length ? 'Try a broader search or clear the category filter.' : 'Add training content to get started.'}</p>{!items.length && <button type="button" className="admin-line-primary" onClick={() => setShowAdd(true)}>Add Content</button>}</div> : <div className="admin-line-catalog-grid">{filtered.map((item) => (
          <AdminCatalogCard
            key={item.id}
            eyebrow={CATEGORY_LABEL[item.category] || item.category}
            title={item.title}
            statusLabel={item.isPublished ? 'Published' : 'Draft'}
            statusTone={item.isPublished ? 'lime' : 'muted'}
            preview={item.fileName ? `${item.fileName}${item.fileSize ? ` (${fmtSize(item.fileSize)})` : ''}` : item.description}
            metaLeft={item.type}
            extra={
              editingId === item.id ? (
                <div className="admin-line-editor-grid" style={{ marginTop: 8 }}>
                  <div className="admin-line-field">
                    <label>Title</label>
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div className="admin-line-field">
                    <label>Description</label>
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                  </div>
                </div>
              ) : undefined
            }
            actions={
              editingId === item.id ? (
                <>
                  <button type="button" className="admin-line-primary" onClick={() => saveEdit(item)}>
                    Save
                  </button>
                  <button type="button" className="admin-line-action" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="admin-line-action" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="admin-line-toggle"
                    aria-pressed={item.isPublished}
                    onClick={() => togglePublish(item)}
                  >
                    <span />
                  </button>
                  <span className="admin-line-meta">{item.isPublished ? 'Published' : 'Unpublished'}</span>
                  <button type="button" className="admin-line-action delete" onClick={() => setConfirmDeleteId(item.id!)}>
                    Delete
                  </button>
                </>
              )
            }
            confirmStrip={
              confirmDeleteId === item.id ? (
                <AdminConfirmStrip
                  label={`Delete "${item.title}"? This also removes the uploaded file.`}
                  onCancel={() => setConfirmDeleteId(null)}
                  onConfirm={() => remove(item)}
                />
              ) : undefined
            }
          />
        ))}</div>}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function AdminUniversityPage() {
  return <AdminUniversity />;
}
