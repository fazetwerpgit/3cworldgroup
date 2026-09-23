'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { AdminFailed, AdminNotice, AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import q from './action-queue.module.css';
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

// The alerts and activate routes verify the caller from the ID token — the
// claimer stamped on a task and the management check both come from it.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing.map(String).join(', ')
    : '';
}

function formatRelativeAge(createdAt: string | null): string {
  if (!createdAt) return '';

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return '';

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (elapsedSeconds < 60) return ' · just now';
  if (elapsedSeconds < 3600) return ` · ${Math.floor(elapsedSeconds / 60)}m ago`;
  if (elapsedSeconds < 86400) return ` · ${Math.floor(elapsedSeconds / 3600)}h ago`;
  return ` · ${Math.floor(elapsedSeconds / 86400)}d ago`;
}

export default function ActionQueue() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AlertTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/alerts', {
        headers: await authHeaders(),
      });
      const json = await readJson(response);
      if (!response.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to load action queue'
        );
      }
      setTasks(Array.isArray(json.tasks) ? (json.tasks as AlertTaskRow[]) : []);
      setLoadFailed(false);
    } catch {
      // A failed load says so (with a retry) rather than showing an empty queue.
      setLoadFailed(true);
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
        headers: await authHeaders(true),
        body: JSON.stringify({ taskId }),
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
        headers: await authHeaders(true),
        // userId is the TARGET rep being activated, not the caller.
        body: JSON.stringify({ userId: task.subjectUserId }),
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

  async function dismiss(taskId: string) {
    if (!user) return;
    setBusy(taskId);
    setError('');

    try {
      const response = await fetch('/api/portal/alerts/dismiss', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ taskId }),
      });
      const json = await readJson(response);
      if (!response.ok) {
        throw new Error(
          typeof json.error === 'string' ? json.error : 'Failed to dismiss task'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss task');
    } finally {
      setBusy(null);
      void load();
    }
  }

  if (!loading && tasks.length === 0 && !error && !loadFailed) return null;

  return (
    <section className={s.panel} aria-labelledby="activation-tasks-heading">
      <div className={s.panelHead}>
        <h2 id="activation-tasks-heading" className={s.kicker}>
          Activation tasks
        </h2>
        {(!loading || tasks.length > 0) && !(loadFailed && tasks.length === 0) ? (
          <span className={u.panelMeta}>
            {tasks.length} task{tasks.length === 1 ? '' : 's'} ready
          </span>
        ) : null}
      </div>

      {loadFailed && tasks.length > 0 ? (
        <div className={q.noticeWrap}>
          <AdminNotice tone="warn">Couldn&apos;t refresh activation tasks. Showing the last list.</AdminNotice>
        </div>
      ) : null}

      {error ? (
        <div className={q.noticeWrap}>
          <AdminNotice tone="error" onDismiss={() => setError('')}>
            {error}
          </AdminNotice>
        </div>
      ) : null}

      {loadFailed && tasks.length === 0 ? (
        <AdminFailed what="activation tasks" onRetry={() => void load()} />
      ) : loading && tasks.length === 0 ? (
        <AdminSkeletonRows rows={1} label="Loading activation tasks" />
      ) : tasks.length === 0 ? (
        error ? null : (
          <p className={q.none}>No manager tasks are waiting right now.</p>
        )
      ) : (
        <ul className={`${u.rows} ${q.list}`}>
          {tasks.map((task) => {
            const working = busy === task.id;
            return (
              <li key={task.id} className={`${u.row} ${q.task} ${task.kind === 'activation_ready' ? u.rowHot : ''}`}>
                <span className={u.person}>
                  <span className={u.personText}>
                    <span className={u.personName}>
                      <span>{task.subjectName}</span>
                    </span>
                    <span className={q.taskMsg}>
                      {task.message}
                      {task.status === 'claimed' &&
                        ` · claimed by ${task.claimedByName || task.claimedBy || 'another manager'}`}
                      {formatRelativeAge(task.createdAt)}
                    </span>
                  </span>
                </span>
                <span className={`${u.btnRow} ${q.taskActions}`}>
                  <Link href={task.link} className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}>
                    View
                  </Link>
                  {task.status === 'open' && (
                    <button
                      type="button"
                      className={`${s.btnSecondary} ${u.sm} ${q.claimAct}`}
                      disabled={working}
                      onClick={() => void claim(task.id)}
                    >
                      {working ? <Loader2 size={16} className={u.spin} aria-label="Working" /> : "I've got it"}
                    </button>
                  )}
                  {task.kind === 'activation_ready' && (
                    <button
                      type="button"
                      className={`${s.btnPrimary} ${u.primarySm} ${q.activateAct}`}
                      disabled={working}
                      onClick={() => void activate(task)}
                    >
                      {working ? <Loader2 size={16} className={u.spin} aria-label="Working" /> : 'Activate'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
                    disabled={working}
                    onClick={() => void dismiss(task.id)}
                  >
                    {working ? <Loader2 size={16} className={u.spin} aria-label="Working" /> : 'Dismiss'}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
