'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import {
  AdminCatalogCard,
  AdminCatalogList,
  AdminConfirmStrip,
} from '@/components/admin/AdminCatalogList';
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

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      const response = await fetch(`/api/portal/email-templates?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load templates');
      setTemplates(json.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          category: form.category,
          subject: form.subject,
          body: form.body,
          createdBy: user.uid,
          createdByName: user.displayName || user.email,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, requestedBy: user.uid }),
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

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <AdminCatalogList
        kicker="catalog / message templates"
        heroAccent="Keep every record"
        heroPlain="ready to reuse."
        intro="Email templates are the first room in a shared manage-a-list pattern that also works for chat channels, form options, and university content."
        heroCount={templates.length}
        heroCountLabel="templates on file"
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search templates',
          ariaLabel: 'Search templates',
        }}
        categoryFilter={{ value: category, onChange: (v) => setCategory(v as EmailTemplateCategory | 'all'), options: CATEGORY_OPTIONS }}
        toolbarExtra={
          <button
            type="button"
            className="admin-line-primary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setEditingId('new');
            }}
          >
            New template
          </button>
        }
        loading={loading}
        loadingLabel="Loading templates…"
        error={error || null}
        success={success || null}
        isEmpty={filtered.length === 0}
        isFilteredEmpty={templates.length > 0}
        emptyTrue={{
          title: 'No templates saved.',
          body: 'Start a new template to save manager-approved copy.',
          action: (
            <div className="admin-line-starter">
              <button type="button" onClick={() => { setForm(EMPTY_FORM); setEditingId('new'); }}>
                New template
              </button>
            </div>
          ),
        }}
        emptyFiltered={{
          title: 'No templates match.',
          body: 'Try a broader search or clear the category filter.',
          action: (
            <div className="admin-line-starter">
              <button type="button" onClick={() => { setQuery(''); setCategory('all'); }}>
                Clear filters
              </button>
            </div>
          ),
        }}
      >
        {filtered.map((template) => (
          <AdminCatalogCard
            key={template.id}
            eyebrow={EmailTemplateCategoryLabels[template.category]}
            title={template.name}
            statusLabel={template.category}
            statusTone="muted"
            subject={`Subject: ${template.subject}`}
            preview={template.body}
            metaLeft={relativeUpdated(template.updatedAt)}
            metaRight={`${tokenCount(template.body)} tokens`}
            actions={
              <>
                <button type="button" className="admin-line-action" onClick={() => handleCopy(template)}>
                  {copiedId === template.id ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  className="admin-line-action"
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
                  Edit
                </button>
                <button
                  type="button"
                  className="admin-line-action delete"
                  onClick={() => setConfirmDeleteId(template.id)}
                  disabled={deletingId === template.id}
                >
                  Delete
                </button>
              </>
            }
            confirmStrip={
              confirmDeleteId === template.id ? (
                <AdminConfirmStrip
                  label={`Delete this template?`}
                  confirming={deletingId === template.id}
                  onCancel={() => setConfirmDeleteId(null)}
                  onConfirm={() => handleDelete(template)}
                />
              ) : undefined
            }
          />
        ))}

        {editingId && (
          <div className="admin-line-editor">
            <div className="admin-line-panel-head">
              <div>
                <div className="admin-line-eyebrow">edit in place</div>
                <h2 style={{ margin: '5px 0 0', fontSize: 19, fontWeight: 900, letterSpacing: '-.05em', textTransform: 'uppercase' }}>
                  {form.id ? form.name || 'Edit template' : 'New template'}
                </h2>
              </div>
              <span className="admin-line-meta">no modal / no lost context</span>
            </div>
            <div className="admin-line-editor-grid" style={{ marginTop: 13 }}>
              <div className="admin-line-field">
                <label htmlFor="template-name">Name</label>
                <input
                  id="template-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Welcome - New Rep"
                />
              </div>
              <div className="admin-line-field">
                <label>Category / choose one</label>
                <div className="admin-line-segmented" role="group" aria-label="Category">
                  {(Object.keys(EmailTemplateCategoryLabels) as EmailTemplateCategory[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={form.category === c}
                      onClick={() => setForm({ ...form, category: c })}
                    >
                      {EmailTemplateCategoryLabels[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="admin-line-field full">
                <label htmlFor="template-subject">Subject</label>
                <input
                  id="template-subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Welcome to 3C World Group, {{rep_name}}"
                />
              </div>
              <div className="admin-line-field full">
                <label htmlFor="template-body">Body</label>
                <textarea
                  id="template-body"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Hi {{rep_name}}, ..."
                />
                <div className="admin-line-token-row">
                  {EMAIL_TEMPLATE_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      className="admin-line-token"
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
              </div>
            </div>
            <div className="admin-line-editor-actions">
              <button
                type="button"
                className="admin-line-primary"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="admin-line-clear-button"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </AdminCatalogList>
    </ProtectedRoute>
  );
}
