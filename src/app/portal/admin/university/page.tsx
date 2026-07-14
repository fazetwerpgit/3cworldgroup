'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useTrainingUpload } from '@/hooks/useTrainingUpload';
import { TRAINING_CATEGORIES, TrainingResource } from '@/types';
import {
  AdminCatalogCard,
  AdminCatalogList,
  AdminConfirmStrip,
} from '@/components/admin/AdminCatalogList';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TRAINING_CATEGORIES.map((category) => [category.value, category.label])
);

const CATEGORY_OPTIONS = [{ value: 'all', label: 'All' }, ...TRAINING_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))];

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
      const params = new URLSearchParams({ all: 'true', requestedBy: user.uid });
      const res = await fetch(`/api/portal/training?${params.toString()}`);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedBy: user.uid,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: user.uid, isPublished: !item.isPublished }),
    });
    await load();
  };

  const remove = async (item: TrainingResource) => {
    if (!user) return;
    const params = new URLSearchParams({ requestedBy: user.uid });
    await fetch(`/api/portal/training/${item.id}?${params.toString()}`, { method: 'DELETE' });
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: user.uid, title: editTitle.trim(), description: editDesc.trim() }),
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
      <AdminCatalogList
        kicker="catalog / university content"
        heroAccent="Keep every record"
        heroPlain="ready to reuse."
        intro="Upload documents and videos for reps, organized by carrier — the fourth room in the shared manage-a-list pattern."
        heroCount={items.length}
        heroCountLabel="university content on file"
        search={{ value: query, onChange: setQuery, placeholder: 'Search content', ariaLabel: 'Search university content' }}
        categoryFilter={{ value: category, onChange: setCategory, options: CATEGORY_OPTIONS }}
        toolbarExtra={
          <button type="button" className="admin-line-primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Cancel' : 'Add content'}
          </button>
        }
        loading={loading}
        loadingLabel="Loading content…"
        error={err || uploadError || null}
        success={msg || null}
        isEmpty={filtered.length === 0}
        isFilteredEmpty={items.length > 0}
        emptyTrue={{ title: 'No content yet.', body: 'Add carrier training content to get started.' }}
        emptyFiltered={{
          title: 'No content matches.',
          body: 'Try a broader search or clear the category filter.',
          action: (
            <div className="admin-line-starter">
              <button type="button" onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</button>
            </div>
          ),
        }}
      >
        {showAdd && (
          <div className="admin-line-editor">
            <div className="admin-line-panel-head">
              <div>
                <div className="admin-line-eyebrow">edit in place</div>
                <h2 style={{ margin: '5px 0 0', fontSize: 19, fontWeight: 900, letterSpacing: '-.05em', textTransform: 'uppercase' }}>
                  Add content.
                </h2>
              </div>
            </div>
            <div className="admin-line-editor-grid" style={{ marginTop: 13 }}>
              <div className="admin-line-field">
                <label htmlFor="uni-title">Title</label>
                <input id="uni-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AT&amp;T Fiber install walkthrough" />
              </div>
              <div className="admin-line-field">
                <label>Carrier / choose one</label>
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
                {saving ? 'Saving…' : 'Save content'}
              </button>
              <button type="button" className="admin-line-clear-button" onClick={() => setShowAdd(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {filtered.map((item) => (
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
        ))}
      </AdminCatalogList>
    </ProtectedRoute>
  );
}

export default function AdminUniversityPage() {
  return <AdminUniversity />;
}
