'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
    <aside className="ops-line-activation-rail">
      <div className="ops-line-activation-head">
        <div>
          <p className="ops-line-kicker">Activation ready</p>
          <h3>{tasks.length === 0 ? 'All items approved' : 'Needs attention'}</h3>
        </div>
        <span className="ops-line-kicker">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} ready
        </span>
      </div>

      {error && <div className="ops-line-error-banner">{error}</div>}

      {loading && tasks.length === 0 ? (
        <div className="ops-line-activation-person">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ops-line-kicker">Loading action queue…</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="ops-line-activation-person">
          <span className="ops-line-kicker">No manager tasks are waiting right now.</span>
        </div>
      ) : (
        tasks.map((task) => (
          <div key={task.id} className="ops-line-activation-person">
            <div className="ops-line-person">
              <span className="ops-line-avatar">{task.subjectName?.charAt(0)?.toUpperCase() || '?'}</span>
              <div>
                <strong>{task.subjectName}</strong>
                <small>
                  {task.message}
                  {task.status === 'claimed' &&
                    ` · claimed by ${task.claimedByName || task.claimedBy || 'another manager'}`}
                </small>
              </div>
            </div>
            <div className="ops-line-claim">
              <Link href={task.link} className="ops-line-action">
                View
              </Link>
              {task.status === 'open' && (
                <button type="button" disabled={busy === task.id} onClick={() => void claim(task.id)}>
                  {busy === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "I've got it"}
                </button>
              )}
              {task.kind === 'activation_ready' && (
                <button
                  type="button"
                  className="ops-line-primary"
                  disabled={busy === task.id}
                  onClick={() => void activate(task)}
                >
                  {busy === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </aside>
  );
}
