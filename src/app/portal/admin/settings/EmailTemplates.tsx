'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import rep from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import {
  AdminHead,
  AdminSearch,
  Banner,
  ConfirmStrip,
  EmptyState,
  LoadFailed,
  Seg,
  SkeletonRows,
  cx,
} from '@/components/portal/admin-ops/AdminKit';
import s from '@/components/portal/admin-ops/admin-ops.module.css';
import {
  EMAIL_TEMPLATE_TOKENS,
  EmailTemplateCategory,
  EmailTemplateCategoryLabels,
} from '@/types';

interface TemplateEntry {
  id: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  body: string;
  createdByName: string;
  updatedAt: string | null;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  category: 'general' as EmailTemplateCategory,
  subject: '',
  body: '',
};

const CATEGORY_OPTIONS: { value: EmailTemplateCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(Object.keys(EmailTemplateCategoryLabels) as EmailTemplateCategory[]).map((c) => ({
    value: c,
    label: EmailTemplateCategoryLabels[c],
  })),
];

function relativeUpdated(iso: string | null) {
  if (!iso) return 'never updated';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  return `updated ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function tokenCount(body: string) {
  return (body.match(/\{\{[a-z_]+\}\}/g) || []).length;
}

/** Template text with its {{tokens}} marked, for the card preview and the live preview. */
function WithTokens({ text }: { text: string }) {
  const parts = text.split(/(\{\{[a-z_]+\}\})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\{\{[a-z_]+\}\}$/.test(part) ? (
          <span key={i} className={s.token}>
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

// The template routes verify management from the ID token — the acting
// identity is never sent in the query string or body.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

export function EmailTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmailTemplateCategory | 'all'>('all');

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/email-templates', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load templates');
      setTemplates(json.templates);
      setLoadFailed(false);
    } catch {
      // Load failures show "Couldn't load · Retry" in the list; `error` is for actions.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const retry = () => {
    setLoading(true);
    fetchTemplates();
  };

  const editorRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (editingId) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingId]);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/portal/email-templates', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          category: form.category,
          subject: form.subject,
          body: form.body,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to save template');
      setEditingId(null);
      setForm(EMPTY_FORM);
      flash(form.id ? 'Template updated' : 'Template created');
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: TemplateEntry) => {
    if (!user) return;
    setDeletingId(template.id);
    setError('');
    try {
      const response = await fetch('/api/portal/email-templates', {
        method: 'DELETE',
        headers: await authHeaders(true),
        body: JSON.stringify({ templateId: template.id }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to delete template');
      flash('Template deleted');
      setConfirmDeleteId(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (template: TemplateEntry) => {
    try {
      await navigator.clipboard.writeText(`Subject: ${template.subject}\n\n${template.body}`);
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const matchesQuery = !q || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
      const matchesCategory = category === 'all' || t.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [templates, query, category]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length };
    for (const t of templates) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return counts;
  }, [templates]);

  const closeEditor = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  let list: React.ReactNode;
  if (loading)
    list = (
      <section className={cx(rep.panel, s.listPanel)}>
        <SkeletonRows rows={4} />
      </section>
    );
  else if (loadFailed)
    list = (
      <section className={cx(rep.panel, s.listPanel)}>
        <LoadFailed what="templates" onRetry={retry} />
      </section>
    );
  else if (filtered.length === 0)
    list = (
      <section className={cx(rep.panel, s.listPanel)}>
        {templates.length > 0 ? (
          <EmptyState
            title="No templates match"
            body="Try a broader search or clear the category filter."
            action={
              <button
                type="button"
                className={s.btn}
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState title="No templates saved" body="Start a new template to save manager-approved copy." />
        )}
      </section>
    );
  else
    list = (
      <div className={s.tGrid}>
        {filtered.map((template) => {
          const tokens = tokenCount(template.body);
          return (
            <article key={template.id} className={cx(rep.panel, s.tCard)}>
              <div className={s.tBody}>
                <p className={rep.kicker}>{EmailTemplateCategoryLabels[template.category]}</p>
                <h2 className={s.tName}>{template.name}</h2>
                <p className={s.tSubject}>
                  <span className={s.tSubjectLabel}>Subject </span>
                  <WithTokens text={template.subject} />
                </p>
                <p className={s.tPreview}>
                  <WithTokens text={template.body} />
                </p>
                <p className={s.tMeta}>
                  <span>{relativeUpdated(template.updatedAt)}</span>
                  <span>
                    {tokens} token{tokens === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <div className={s.tFoot}>
                {confirmDeleteId === template.id ? (
                  <ConfirmStrip
                    label="Delete this template?"
                    confirming={deletingId === template.id}
                    onCancel={() => setConfirmDeleteId(null)}
                    onConfirm={() => handleDelete(template)}
                  />
                ) : (
                  <>
                    <button type="button" className={s.btn} onClick={() => handleCopy(template)}>
                      {copiedId === template.id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                      {copiedId === template.id ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      className={s.btn}
                      onClick={() => {
                        setForm({
                          id: template.id,
                          name: template.name,
                          category: template.category,
                          subject: template.subject,
                          body: template.body,
                        });
                        setEditingId(template.id);
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={s.btnDanger}
                      onClick={() => setConfirmDeleteId(template.id)}
                      disabled={deletingId === template.id}
                      aria-label={`Delete ${template.name}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className={s.page}>
        <AdminHead
          title="Email Templates"
          lede="Saved email copy. Copy a template into your own email; nothing is sent from here."
          count={loading || loadFailed ? null : templates.length}
          countLabel={templates.length === 1 ? 'template' : 'templates'}
        />

        <div className={s.toolbar}>
          <AdminSearch value={query} onChange={setQuery} placeholder="Search templates" label="Search templates" />
          <div className={s.toolbarRow}>
            <button
              type="button"
              className={cx(s.btnLime, s.grow)}
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditingId('new');
              }}
            >
              <Plus size={18} aria-hidden="true" />
              New template
            </button>
          </div>
        </div>
        <Seg
          label="Category"
          scroll
          value={category}
          onChange={(v) => setCategory(v as EmailTemplateCategory | 'all')}
          options={CATEGORY_OPTIONS.map((o) => ({
            ...o,
            count: loading || loadFailed ? undefined : categoryCounts[o.value] ?? 0,
          }))}
        />

        {error ? <Banner tone="error">{error}</Banner> : null}
        {success ? <Banner tone="ok">{success}</Banner> : null}

        {editingId ? (
          <section
            ref={editorRef}
            className={rep.panel}
            aria-labelledby="template-editor-title"
            style={{ scrollMarginTop: 96 }}
          >
            <div className={`${rep.panelHead} ${u.band}`}>
              <h2 id="template-editor-title" className={rep.kicker}>
                {form.id ? `Edit · ${form.name || 'template'}` : 'New template'}
              </h2>
            </div>
            <div className={s.editor}>
              <div className={s.editLayout}>
                <div className={s.formGrid}>
                  <div className={s.field}>
                    <label className={s.label} htmlFor="template-name">
                      Name
                    </label>
                    <input
                      id="template-name"
                      className={s.input}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Welcome - New Rep"
                    />
                  </div>
                  <div className={cx(s.field, s.wide)}>
                    <span className={s.label}>Category</span>
                    <Seg
                      label="Category"
                      wrap
                      value={form.category}
                      onChange={(c) => setForm({ ...form, category: c })}
                      options={(Object.keys(EmailTemplateCategoryLabels) as EmailTemplateCategory[]).map((c) => ({
                        value: c,
                        label: EmailTemplateCategoryLabels[c],
                      }))}
                    />
                  </div>
                  <div className={cx(s.field, s.wide)}>
                    <label className={s.label} htmlFor="template-subject">
                      Subject
                    </label>
                    <input
                      id="template-subject"
                      className={s.input}
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      placeholder="Welcome to 3C World Group, {{rep_name}}"
                    />
                  </div>
                  <div className={cx(s.field, s.wide)}>
                    <label className={s.label} htmlFor="template-body">
                      Body
                    </label>
                    <textarea
                      id="template-body"
                      className={cx(s.input, s.textarea)}
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      placeholder="Hi {{rep_name}}, ..."
                    />
                    <div className={s.tokenRow} role="group" aria-label="Insert a token">
                      {EMAIL_TEMPLATE_TOKENS.map((token) => (
                        <button
                          key={token}
                          type="button"
                          className={s.tokenBtn}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              body: prev.body + (prev.body.endsWith(' ') || !prev.body ? '' : ' ') + token,
                            }))
                          }
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <p className={s.hint}>Tap a token to add it to the end of the body.</p>
                  </div>
                </div>
                <div className={s.field}>
                  <span className={s.label}>Preview</span>
                  <div className={s.preview} aria-live="polite">
                    <p className={s.previewSubject}>
                      {form.subject ? <WithTokens text={form.subject} /> : <span className={s.previewEmpty}>No subject yet</span>}
                    </p>
                    <p className={s.previewBody}>
                      {form.body ? <WithTokens text={form.body} /> : <span className={s.previewEmpty}>No body yet</span>}
                    </p>
                  </div>
                </div>
              </div>
              <div className={s.editorActions}>
                <button
                  type="button"
                  className={s.btnLime}
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
                >
                  {saving ? 'Saving…' : 'Save template'}
                </button>
                <button type="button" className={s.btn} onClick={closeEditor} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {list}
      </div>
    </ProtectedRoute>
  );
}
