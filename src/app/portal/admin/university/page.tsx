'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { useTrainingUpload } from '@/hooks/useTrainingUpload';
import { TRAINING_CATEGORIES, TrainingResource } from '@/types';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TRAINING_CATEGORIES.map((category) => [category.value, category.label])
);

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

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('att');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [publish, setPublish] = useState(true);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr('');

    try {
      const params = new URLSearchParams({
        all: 'true',
        requestedBy: user.uid,
      });
      const res = await fetch(`/api/portal/training?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        setItems(data.resources || []);
      } else {
        setErr(data.error || 'Failed to load content');
      }
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

  const canSave = Boolean(title.trim() && category && pending && !uploading && !saving);

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
          category,
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
    if (!confirm(`Delete "${item.title}"? This also removes the uploaded file.`)) return;

    const params = new URLSearchParams({ requestedBy: user.uid });
    await fetch(`/api/portal/training/${item.id}?${params.toString()}`, { method: 'DELETE' });
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
      body: JSON.stringify({
        requestedBy: user.uid,
        title: editTitle.trim(),
        description: editDesc.trim(),
      }),
    });
    setEditingId(null);
    await load();
  };

  const fmtSize = (bytes?: number) => (
    bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : ''
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <PortalPageHeader
          compact
          eyebrow="Admin"
          title="University Content"
          description="Upload documents and videos for reps, organized by carrier."
        />

        {(msg || err || uploadError) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              err || uploadError
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
            }`}
          >
            {err || uploadError || msg}
          </div>
        )}

        <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-border p-5">
            <CardTitle className="text-[#0A1F44] dark:text-foreground">Add content</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <div>
              <Label className="mb-1">Title *</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. AT&T Fiber install walkthrough"
              />
            </div>
            <div>
              <Label className="mb-1">Carrier *</Label>
              <NativeSelect
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full"
              >
                {TRAINING_CATEGORIES.map((trainingCategory) => (
                  <NativeSelectOption key={trainingCategory.value} value={trainingCategory.value}>
                    {trainingCategory.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1">Description</Label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional short summary"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1">File (PDF, image, or video)</Label>
              <input
                type="file"
                accept="application/pdf,image/*,video/*"
                onChange={onPickFile}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#8dc63f] file:px-4 file:py-2 file:text-[#0A1F44] hover:file:bg-[#7ab82e] dark:text-muted-foreground"
              />
              {uploading && (
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded bg-slate-100 dark:bg-muted">
                    <div className="h-full bg-[#8dc63f] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                    Uploading... {progress}%
                  </p>
                </div>
              )}
              {pending && !uploading && (
                <p className="mt-2 text-sm text-[#4f7f1e] dark:text-green-300">
                  Ready: {pending.fileName} ({fmtSize(pending.fileSize)})
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-muted-foreground">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(event) => setRequired(event.target.checked)}
                />{' '}
                Required training
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-muted-foreground">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(event) => setPublish(event.target.checked)}
                />{' '}
                Publish immediately
              </label>
              <Button
                onClick={onSave}
                disabled={!canSave}
                className="ml-auto bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
              >
                {saving ? 'Saving...' : 'Save content'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-border p-5">
            <CardTitle className="text-[#0A1F44] dark:text-foreground">Existing content</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-muted-foreground">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-muted-foreground">No content yet.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3"
                  >
                    {editingId === item.id ? (
                      <>
                        <div className="min-w-0 flex-1 space-y-2">
                          <Input
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            placeholder="Title"
                          />
                          <Input
                            value={editDesc}
                            onChange={(event) => setEditDesc(event.target.value)}
                            placeholder="Description"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(item)}
                          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                        >
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-950 dark:text-foreground">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground">
                            {CATEGORY_LABEL[item.category] || item.category} - {item.type} -{' '}
                            {item.fileName || '-'} {item.fileSize ? `(${fmtSize(item.fileSize)})` : ''}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            item.isPublished
                              ? 'border-[#8dc63f]/40 text-[#3f6212] dark:text-[#d7ecc0]'
                              : 'border-slate-300 text-slate-500'
                          }
                        >
                          {item.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => togglePublish(item)}>
                          {item.isPublished ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(item)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

export default function AdminUniversityPage() {
  return <AdminUniversity />;
}
