'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import type { AlertTaskKind, AlertTaskStatus } from '@/types/alerts';

interface AlertTaskRow {
  id: string;
  kind: AlertTaskKind;
  subjectUserId: string;
  subjectName: string;
  title: string;
  message: string;
  link: string;
  status: Extract<AlertTaskStatus, 'open' | 'claimed'>;
  claimedBy?: string;
  claimedByName?: string;
  createdAt: string | null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing.map(String).join(', ')
    : '';
}

export default function ActionQueue() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AlertTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(
        `/api/portal/alerts?requestedBy=${encodeURIComponent(user.uid)}`
      );
      const json = await readJson(response);
      if (!response.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to load action queue'
        );
      }
      setTasks(Array.isArray(json.tasks) ? (json.tasks as AlertTaskRow[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load action queue');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function claim(taskId: string) {
    if (!user) return;
    setBusy(taskId);
    setError('');

    try {
      const response = await fetch('/api/portal/alerts/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: user.uid, taskId }),
      });
      const json = await readJson(response);
      if (!response.ok) {
        if (response.status === 409) {
          setError('That task was already claimed. Refreshing the queue.');
          return;
        }
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to claim task'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim task');
    } finally {
      setBusy(null);
      void load();
    }
  }

  async function activate(task: AlertTaskRow) {
    if (!user) return;
    setBusy(task.id);
    setError('');

    try {
      const response = await fetch('/api/portal/onboarding/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: user.uid, userId: task.subjectUserId }),
      });
      const json = await readJson(response);
      if (!response.ok) {
        if (response.status === 409) {
          const missing = formatMissingItems(json.missing);
          throw new Error(
            missing
              ? `Cannot activate yet. Missing: ${missing}`
              : 'Cannot activate yet. Required onboarding items are missing.'
          );
        }
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to activate rep'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate rep');
    } finally {
      setBusy(null);
      void load();
    }
  }

  if (!loading && tasks.length === 0 && !error) return null;

  return (
    <section className="portal-enter portal-enter-2 space-y-3">
      <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
        <CardHeader className="border-b border-slate-100 p-5 dark:border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-foreground">
                Needs attention
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
                Open and claimed manager tasks from onboarding alerts.
              </p>
            </div>
            <Badge variant={tasks.length > 0 ? 'warning' : 'outline'} className="rounded-md px-3 py-1">
              {tasks.length} task{tasks.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
              {error}
            </div>
          )}

          {loading && tasks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading action queue...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              No manager tasks are waiting right now.
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-border dark:bg-muted"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950 dark:text-foreground">
                          {task.title}
                        </p>
                        <Badge
                          variant={task.status === 'open' ? 'warning' : 'outline'}
                          className="rounded-md"
                        >
                          {task.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
                        {task.message}
                      </p>
                      {task.status === 'claimed' && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                          Claimed by {task.claimedByName || task.claimedBy || 'another manager'}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={task.link}>View</Link>
                      </Button>
                      {task.status === 'open' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy === task.id}
                          onClick={() => void claim(task.id)}
                        >
                          {busy === task.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "I've got it"
                          )}
                        </Button>
                      )}
                      {task.kind === 'activation_ready' && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy === task.id}
                          onClick={() => void activate(task)}
                        >
                          {busy === task.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Activate'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
