'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, FilePlus, Pencil, Trash2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
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

const TEMPLATE_STARTERS = [
  {
    name: 'New Rep Onboarding',
    category: 'onboarding' as EmailTemplateCategory,
    subject: 'Next steps for your 3C onboarding',
    body:
      'Hi {{rep_name}},\n\nWelcome to 3C World Group. Please complete your onboarding checklist in the portal, including your W-9, contract, direct deposit reference, and required submissions.\n\nReply to this email if you get stuck on any step.\n\nThanks,\n{{manager_name}}',
  },
  {
    name: 'Training Day 1 Reminder',
    category: 'onboarding' as EmailTemplateCategory,
    subject: 'Day 1 training call and online training',
    body:
      'Hi {{rep_name}},\n\nToday is your Day 1 training call. We will walk through the online training expectations and make sure you know what to complete before field work begins.\n\nCall date: {{date}}\n\nThanks,\n{{manager_name}}',
  },
  {
    name: 'Field Training Request',
    category: 'performance' as EmailTemplateCategory,
    subject: 'Field training needed for {{rep_name}}',
    body:
      'Hi {{manager_name}},\n\n{{rep_name}} is ready for field training. Please schedule time to work with them in the field and confirm once the first session is complete.\n\nThanks,\n3C Operations',
  },
  {
    name: 'Channel Clearance Notice',
    category: 'onboarding' as EmailTemplateCategory,
    subject: '{{rep_name}} is cleared for channel sales',
    body:
      'Hi {{rep_name}},\n\nYou have been cleared for the assigned sales channel. Review your portal notifications and confirm with your manager before beginning field activity.\n\nThanks,\n3C Operations',
  },
  {
    name: 'Decommission Follow-up',
    category: 'performance' as EmailTemplateCategory,
    subject: '3C portal access update',
    body:
      'Hi {{rep_name}},\n\nWe are following up about your 3C portal status. Please contact management if you believe this update was made in error or if you need to discuss next steps.\n\nThanks,\n3C Operations',
  },
];

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

  const applyStarter = (starter: (typeof TEMPLATE_STARTERS)[number]) => {
    setForm({
      id: '',
      name: starter.name,
      category: starter.category,
      subject: starter.subject,
      body: starter.body,
    });
    setShowForm(true);
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
      <div className="mx-auto max-w-[1200px] space-y-5">
        <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">
                Email Templates
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-muted-foreground">
                Save manager-approved copy for onboarding, performance, and
                operations follow-up.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowForm(true);
              }}
              className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
            >
              <FilePlus className="h-4 w-4" />
              New Template
            </Button>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-4 py-3 text-sm text-[#4f7f1e] dark:text-green-300">
            {success}
          </div>
        )}

        {loading ? (
          <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card text-center shadow-sm">
            <CardContent className="py-8">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
              <p className="mt-4 text-sm text-slate-500 dark:text-muted-foreground">Loading templates...</p>
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <h2 className="text-base font-semibold text-slate-950 dark:text-foreground">
                No templates saved
              </h2>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                Start from an operating template, then edit the copy before saving.
              </p>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TEMPLATE_STARTERS.map((starter) => (
                  <button
                    key={starter.name}
                    onClick={() => applyStarter(starter)}
                    className="cursor-pointer rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8dc63f]/60 hover:bg-[#8dc63f]/10 hover:shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-950 dark:text-foreground">
                      {starter.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                      {EmailTemplateCategoryLabels[starter.category]}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-semibold text-slate-950 dark:text-foreground">
                          {template.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className="border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-slate-600 dark:text-muted-foreground"
                        >
                          {EmailTemplateCategoryLabels[template.category]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-foreground">
                        {template.subject}
                      </p>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-500 dark:text-muted-foreground">
                        {template.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(template)}
                      >
                        <Copy className="h-4 w-4" />
                        {copiedId === template.id ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(template)}
                        disabled={deletingId === template.id}
                        className="border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-800 dark:hover:text-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === template.id ? 'Deleting' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-xl">
            <CardHeader className="border-b border-slate-100 dark:border-border p-5">
              <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">
                {form.id ? 'Edit Template' : 'New Template'}
              </h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                Templates are stored for copying. They do not send email from the app.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                  Starter templates
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TEMPLATE_STARTERS.map((starter) => (
                    <Button
                      key={starter.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyStarter(starter)}
                    >
                      {starter.name}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                    Name
                  </label>
                  <Input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Welcome - New Rep"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                    Category
                  </label>
                  <NativeSelect
                    value={form.category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value as EmailTemplateCategory,
                      })
                    }
                    className="w-full"
                  >
                    {(
                      Object.keys(EmailTemplateCategoryLabels) as EmailTemplateCategory[]
                    ).map((c) => (
                      <NativeSelectOption key={c} value={c}>
                        {EmailTemplateCategoryLabels[c]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Subject
                </label>
                <Input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Welcome to 3C World Group, {{rep_name}}"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-muted-foreground">
                  Body
                </label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  placeholder="Hi {{rep_name}},&#10;&#10;..."
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                  Tokens you can use: {EMAIL_TEMPLATE_TOKENS.join(', ')}. Replace
                  them manually before sending.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()
                  }
                  className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </ProtectedRoute>
  );
}
