'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
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

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/email-templates?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load templates');
      }
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
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save template');
      }
      setShowForm(false);
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
      if (!response.ok) {
        throw new Error(json.error || 'Failed to delete template');
      }
      flash('Template deleted');
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeletingId(null);
    }
  };

  // Copy subject + body for pasting into an email client - the app
  // organizes templates, it does not send mail
  const handleCopy = async (template: TemplateEntry) => {
    try {
      await navigator.clipboard.writeText(
        `Subject: ${template.subject}\n\n${template.body}`
      );
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Email Templates</h1>
            <p className="text-white/60 text-sm">
              Reusable management emails - copy into your email client to send
            </p>
          </div>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-[#8dc63f] text-white rounded-xl text-sm font-medium hover:bg-[#7ab82e] transition-colors"
          >
            New Template
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-xl text-sm border border-red-500/20">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-[#8dc63f]/10 text-[#8dc63f] px-4 py-3 rounded-xl text-sm border border-[#8dc63f]/20">
            {success}
          </div>
        )}

        {loading ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
            <p className="mt-4 text-white/60">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 p-8 text-center">
            <p className="text-3xl mb-2">✉️</p>
            <p className="text-white font-semibold">No templates yet</p>
            <p className="text-white/60 text-sm mt-1">
              Create the first template - leadership will supply final copy.
            </p>
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-white">{template.name}</h3>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                      {EmailTemplateCategoryLabels[template.category]}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 mt-2 font-medium">
                    {template.subject}
                  </p>
                  <p className="text-sm text-white/50 mt-1 whitespace-pre-line line-clamp-3">
                    {template.body}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(template)}
                    className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
                  >
                    {copiedId === template.id ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => {
                      setForm({
                        id: template.id,
                        name: template.name,
                        category: template.category,
                        subject: template.subject,
                        body: template.body,
                      });
                      setShowForm(true);
                    }}
                    className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    disabled={deletingId === template.id}
                    className="px-3 py-1.5 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === template.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white">
              {form.id ? 'Edit Template' : 'New Template'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Welcome - New Rep"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as EmailTemplateCategory })
                  }
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#8dc63f] [&>option]:text-gray-900"
                >
                  {(Object.keys(EmailTemplateCategoryLabels) as EmailTemplateCategory[]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {EmailTemplateCategoryLabels[c]}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Welcome to 3C World Group, {{rep_name}}!"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Body</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={8}
                placeholder="Hi {{rep_name}},&#10;&#10;..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#8dc63f]"
              />
              <p className="text-xs text-white/40 mt-1">
                Tokens you can use: {EMAIL_TEMPLATE_TOKENS.join(', ')} - replace them
                manually before sending.
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                }}
                disabled={saving}
                className="px-4 py-2 text-white/60 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()
                }
                className="px-4 py-2 bg-[#8dc63f] text-white rounded-lg text-sm font-medium hover:bg-[#7ab82e] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
